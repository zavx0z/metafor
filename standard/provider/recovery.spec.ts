import {expect, test} from "bun:test"
import {agent, methods, PROTOCOL_VERSION, type AnyMessage} from "@agentclientprotocol/sdk"
import peer from "@zavx0z/provider-tech-peer"
import type {PeerNetwork} from "@zavx0z/provider-tech-peer/types"
import type {ProviderBinding} from "@metafor/types/metafor/providers"
import type {MassHandle} from "@metafor/types/metafor/mass"
import {createProviderRegistry} from "./catalog"
import {createPeerChatDriver} from "./peer-driver"
import turn from "./turn"
import send, {receive} from "../chat/send"

const binding: ProviderBinding = {id: "qwen", service: "qwen", host: "codespace", remotePeerId: "host", executorId: "browser", assignmentId: "assigned"}
const prompt = "Ответь одним словом: готово"
const original = {id: "original", prompt, sessionId: null, providerRef: "atom:40", expectedBinding: null}
const recovery = () => ({schema: "provider/browser-recovery/v1", version: 1, service: "qwen", sessionId: "native-session", turnId: "native-turn", turnCount: 1,
  prompt, response: "Готово", conversationId: "native-conversation", requestId: "native-attempt:wire-request", userId: "native-user", assistantId: "native-assistant", attachments: [], complete: true})
function memory(initial: unknown) {
  let value = structuredClone(initial)
  const handle: MassHandle = {async readJson() {return structuredClone(value)}, async readText() {return JSON.stringify(value)},
    async readBytes() {return new TextEncoder().encode(JSON.stringify(value))}, async write(next) {value = structuredClone(next)}}
  return {handle, read: () => structuredClone(value) as any}
}

function fixture(proof: unknown = recovery()) {
  type Event = {peerId: string; channel: string; data: Uint8Array | string}
  const listeners = [new Set<(event: Event) => void>(), new Set<(event: Event) => void>()]
  const networks = ["consumer", "host"].map((id, index): PeerNetwork => ({
    async send(target, data, options) {
      if (target !== (index ? "consumer" : "host")) throw Error("Unexpected peer")
      await Promise.resolve()
      for (const listener of listeners[1 - index]!) listener({peerId: id, channel: options?.channel ?? "", data})
    }, onData(listener) {listeners[index]!.add(listener); return () => {listeners[index]!.delete(listener)}}, subscribe() {return () => {}},
  }))
  const calls: string[] = [], admissions: unknown[] = []
  let leases = 0, prompts = 0
  const host = peer.createPeerHost({network: networks[1]!, authorize: (id, executor, request) => id === "consumer" && executor === "browser" && request.assignmentId === "assigned",
    executors: {browser: {cwd: "/owner", mcpServers: [], async open(context) {
      admissions.push(context.params)
      const incoming = new TransformStream<AnyMessage, AnyMessage>(), outgoing = new TransformStream<AnyMessage, AnyMessage>()
      const server = agent({name: "strict-browser-fixture"})
        .onRequest(methods.agent.initialize, () => {calls.push("initialize"); return {protocolVersion: PROTOCOL_VERSION, agentCapabilities: {loadSession: true}}})
        .onRequest(methods.agent.session.load, async ({params, client}) => {
          calls.push("session/load")
          expect(params).toMatchObject({sessionId: "native-session", cwd: "/owner", mcpServers: []})
          await client.notify(methods.client.session.update, {sessionId: params.sessionId, update: {sessionUpdate: "agent_message_chunk", content: {type: "text", text: "Transcript alone is not proof"}}})
          return proof === null ? {} : {_meta: {"zavx0z.provider.browser.recovery": proof}}
        })
        .onRequest(methods.agent.session.prompt, () => {prompts++; throw Error("Recovery must not prompt")})
        .onRequest(methods.agent.session.new, () => {throw Error("Recovery must not create sessions")})
        .onRequest(methods.agent.session.resume, () => {throw Error("Recovery must use one explicit load")})
        .connect({readable: incoming.readable, writable: outgoing.writable})
      return {stream: {readable: outgoing.readable, writable: incoming.writable}, closed: server.closed.then(() => {}), async dispose() {server.close()}}
    }}}})
  const driver = createPeerChatDriver({binding, async connect() {leases++; return {network: networks[0]!, async close() {leases--}}}})
  const registry = memory(createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"},
    resolution: "exact", connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: null, message: null}}]))
  const turns = memory({version: 1, providerRef: "atom:40", binding, sessionId: "native-session", requests: [{request: original, phase: "prompting", result: null}]})
  const chat = memory({version: 1, provider: "qwen", binding, bindingId: binding.id, providerRef: "atom:40", sessionId: "native-session",
    messages: [{requestId: original.id, role: "user", content: prompt}], requests: [{id: original.id, prompt, providerRequest: JSON.stringify(original), state: "pending"}]})
  const run = (request = original) => turn({request: JSON.stringify(request), binding: binding.id, mass: {registry: registry.handle, turns: turns.handle},
    energy: {}, driver, signal: AbortSignal.timeout(5000), self: {atom: "40"}})
  return {run, turns, registry, chat, calls, admissions, prompts: () => prompts, leases: () => leases, async close() {await host.close()}}
}

test("strict recovery completes the original Provider and Chat pending row through one scoped load without Send", async () => {
  const f = fixture()
  try {
    const replay = await send({request: JSON.stringify({id: original.id, prompt}), binding: binding.id, providerRef: "atom:40", mass: {session: f.chat.handle}, signal: AbortSignal.timeout(5000)})
    expect(replay.providerRequest).toBe(JSON.stringify(original))
    const result = await f.run(JSON.parse(replay.providerRequest!))
    expect(result).toMatchObject({ackId: original.id, outcome: "completed", response: "Готово", sessionId: "native-session"})
    await receive({request: JSON.stringify({id: original.id, prompt}), binding: binding.id, providerRef: result.providerRef, mass: {session: f.chat.handle}, signal: AbortSignal.timeout(5000),
      providerAck: result.ack, providerAckId: result.ackId, providerResponse: result.response, providerError: result.error, providerSessionId: result.sessionId,
      providerOutcome: result.outcome, providerBindingDescriptor: result.bindingDescriptor})
    expect(f.turns.read().requests).toHaveLength(1)
    expect(f.turns.read().requests[0].phase).toBe("completed")
    expect(f.chat.read().requests[0].state).toBe("completed")
    expect(f.chat.read().messages).toEqual([{requestId: original.id, role: "user", content: prompt}, {requestId: original.id, role: "assistant", content: "Готово"}])
    expect(await f.run()).toEqual(result)
    expect(f.calls).toEqual(["initialize", "session/load"])
    expect(f.admissions).toEqual([{assignmentId: "assigned", previousSessionId: "native-session"}])
    expect(f.prompts()).toBe(0)
    expect(f.leases()).toBe(0)
  } finally {await f.close()}
})

test("legacy replay, wrong native receipt and attachments preserve uncertainty without Send or history changes", async () => {
  for (const proof of [null, {...recovery(), sessionId: "other-session"}, {...recovery(), prompt: "Other"}, {...recovery(), requestId: ""},
    {...recovery(), complete: false}, {...recovery(), attachments: ["unexpected-image"]}, {...recovery(), turnCount: 0}, {...recovery(), turnCount: 2}]) {
    const f = fixture(proof), before = f.turns.read()
    try {
      expect((await f.run()).outcome).toBe("uncertain")
      expect(f.turns.read()).toEqual(before)
      expect(f.chat.read().messages).toHaveLength(1)
      expect(f.calls).toEqual(["initialize", "session/load"])
      expect(f.prompts()).toBe(0)
      expect(f.leases()).toBe(0)
    } finally {await f.close()}
  }
})

test("a different request, non-last row or reassigned Provider never enters read recovery", async () => {
  for (const mode of ["other-request", "changed-binding", "not-last"] as const) {
    const f = fixture()
    try {
      if (mode === "changed-binding") {const registry = f.registry.read(); registry.entries[0].host = "other"; await f.registry.handle.write(registry)}
      if (mode === "not-last") {const state = f.turns.read(); state.requests.push({request: {...original, id: "later", sessionId: "native-session", expectedBinding: binding}, phase: "opening", result: null}); await f.turns.handle.write(state)}
      expect((await f.run(mode === "other-request" ? {...original, id: "other-request"} : original)).outcome).toBe("uncertain")
      expect(f.calls).toEqual([])
      expect(f.prompts()).toBe(0)
      expect(f.turns.read().requests).toHaveLength(mode === "not-last" ? 2 : 1)
    } finally {await f.close()}
  }
})
