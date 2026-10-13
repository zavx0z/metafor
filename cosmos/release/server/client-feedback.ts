import {OracleRpcAdmissionRefusedError, type OracleRpcPeer} from "shared/transport/oracle"
import {READ_GRAPH_METHOD, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {STANDARD_AGENT_META} from "@metafor/types/metafor/agent-observation"
import {parseAgentFeedbackRequest, type AgentFeedbackReceipt} from "@metafor/types/metafor/agents"
import {DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"
import type {ClientAnnotationFeedback} from "@metafor/types/cosmos/client"

const receipt = (text: unknown, id: string): AgentFeedbackReceipt | null => {
  if (typeof text !== "string") return null
  try {const value = JSON.parse(text); return value && Object.keys(value).sort().join(",") === "accepted,id,replayed" && value.id === id && value.accepted === true && typeof value.replayed === "boolean" ? value : null} catch {return null}
}
const findAgent = (graph: Graph, ref: string): RuntimeAtom | undefined => {
  const nodes: RuntimeNode[] = [...graph.runtime.roots]
  for (let index = 0; index < nodes.length; index++) {const node = nodes[index]!; if (node.kind === "atom" && node.ref === ref && node.meta === STANDARD_AGENT_META) return node; nodes.push(...(node.children ?? []))}
}

/**
FIFO закреплённого Agent записывает только ordinary feedbackRequest Field через
Oracle. Следующий intent ждёт очистки предыдущего и durable Chat ack. Повтор
сохраняет immutable payload; canonical Chat Mass остаётся владельцем dedupe.
Ни task, ни пользовательский draft, ни model turn этот adapter не создаёт.
*/
export function createClientFeedbackBridge(input: {peer: Pick<OracleRpcPeer, "call">; admitted(): boolean; signal: AbortSignal; pollMs?: number; timeoutMs?: number}) {
  const tails = new Map<string, Promise<void>>()
  const jobs = new Map<string, {content: string; promise: Promise<AgentFeedbackReceipt>}>()
  const finished: string[] = []
  const ready = () => {input.signal.throwIfAborted(); if (!input.admitted()) throw new Error("Feedback world is unavailable")}
  const pause = () => Bun.sleep(input.pollMs ?? 250)
  const execute = async (feedback: ClientAnnotationFeedback): Promise<AgentFeedbackReceipt> => {
    const request = parseAgentFeedbackRequest(feedback.request), encoded = JSON.stringify(request)
    const deadline = performance.now() + (input.timeoutMs ?? 30_000)
    let written = false, refusals = 0
    for (;;) {
      ready()
      if (performance.now() >= deadline) throw new Error(written ? "Feedback acknowledgement timed out; accepted outcome may be unknown" : "Feedback admission timed out")
      const [graph, history] = await Promise.all([input.peer.call<Graph>("dark", READ_GRAPH_METHOD, {}),
        input.peer.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})])
      ready()
      if (graph.root !== feedback.world.root || history.frontier.cutId !== feedback.world.cutId) throw new Error("Pinned feedback world changed")
      const agent = findAgent(graph, feedback.agentRef)
      if (!agent || !Object.hasOwn(agent.values, "feedbackRequest")) throw new Error("Pinned Agent does not expose service feedback")
      const values = agent.values
      if (values.feedbackAck === true && values.feedbackAckId === request.id && values.feedbackRequest === null) {
        const accepted = values.feedbackError === null ? receipt(values.feedbackResponse, request.id) : null
        if (accepted && typeof values.feedbackLastRequest === "string") {
          const previous = JSON.stringify(parseAgentFeedbackRequest(JSON.parse(values.feedbackLastRequest)))
          if (previous !== encoded) throw Object.assign(new Error("Feedback id already binds another immutable payload"), {code: "conflict"})
          return {...accepted, replayed: written ? accepted.replayed : true}
        }
        if (written) throw new Error(typeof values.feedbackError === "string" ? values.feedbackError.slice(0, 512) : "Feedback durable acknowledgement is invalid")
      }
      if (typeof values.feedbackRequest === "string") {
        if (JSON.stringify(parseAgentFeedbackRequest(JSON.parse(values.feedbackRequest))) === encoded) written = true
        else if (written) throw new Error("Pinned feedback intent was replaced; outcome may be unknown")
        await pause(); continue
      }
      if (written) {await pause(); continue}
      try {
        await input.peer.call("dark", META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: graph.root, ref: agent.ref, meta: agent.meta},
          field: "feedbackRequest", value: encoded, expectedFrontier: history.frontier})
        written = true
      } catch (error) {
        if (!(error instanceof OracleRpcAdmissionRefusedError) || ++refusals > 8 || !error.data || typeof error.data !== "object" || !("reason" in error.data) || error.data.reason !== "frontier_mismatch") throw error
      }
      await pause()
    }
  }
  return (feedback: ClientAnnotationFeedback): Promise<AgentFeedbackReceipt> => {
    ready()
    const pinned = structuredClone(feedback), content = JSON.stringify(pinned)
    const key = JSON.stringify([pinned.world.root, pinned.world.cutId, pinned.agentRef, pinned.request.id])
    const prior = jobs.get(key)
    if (prior) return prior.content === content ? prior.promise.then(value => ({...value, replayed: true})) : Promise.reject(Object.assign(new Error("Feedback id already binds another immutable payload"), {code: "conflict"}))
    if (jobs.size - finished.length >= 64) return Promise.reject(new Error("Feedback queue capacity exceeded"))
    const owner = JSON.stringify([pinned.world.root, pinned.world.cutId, pinned.agentRef])
    const promise = (tails.get(owner) ?? Promise.resolve()).then(() => execute(pinned))
    const tail = promise.then(() => {}, () => {jobs.delete(key)}).finally(() => {if (tails.get(owner) === tail) tails.delete(owner); if (jobs.has(key)) finished.push(key); while (finished.length > 256) jobs.delete(finished.shift()!)})
    tails.set(owner, tail)
    jobs.set(key, {content, promise})
    return promise
  }
}
