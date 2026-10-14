import {expect, test} from "bun:test"
import {parseMetaAddress, READ_GRAPH_DELTA_METHOD, type RuntimeAtom} from "@metafor/types/metafor/graph"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import {ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, type MetaCausalFrontier, type MetaFieldValueApplyReceipt, type ReadGraphDeltaReceipt} from "shared/protocol/metafor/observation"
import {recoverAgentChat} from "../server/agent-chat-recovery"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

function fixture(race = false) {
  const graph = agentWorkspaceGraph(), root = graph.runtime.roots[0] as RuntimeAtom
  const actor = root.children![0] as RuntimeAtom, chat = actor.children![0] as RuntimeAtom, owner = root.children![1] as RuntimeAtom
  const provider = parseMetaAddress("@metafor/provider")!
  const binding = {id: "qwen", service: "qwen", host: "codespace", remotePeerId: "host", executorId: "qwen"}
  const intent = {id: "original", prompt: "Ответь одним словом: готово"}
  graph.template[actor.meta]!.fields = [{key: "task", type: "string"}, {key: "status", type: "string"}, {key: "providerBinding", type: "string"}]
  graph.template[actor.meta]!.superposition = [{name: "failed", transitions: null}]
  actor.state = "failed"
  actor.values = {task: null, status: "failed", providerBinding: binding.id}
  graph.template[chat.meta]!.fields = [{key: "request", type: "string"}, {key: "ack", type: "boolean", required: true, default: false},
    {key: "binding", type: "string"}, {key: "providerRef", type: "string"}, {key: "sessionId", type: "string"}]
  graph.template[chat.meta]!.superposition = [{name: "failed", transitions: null}]
  graph.template[chat.meta]!.mass = [{key: "session", format: "json"}]
  graph.template[chat.meta]!.matter = [{kind: "wimp", src: provider}]
  chat.state = "failed"
  chat.values = {request: JSON.stringify(intent), ack: true, binding: binding.id, providerRef: "atom:5", sessionId: "native-session"}
  chat.mass = [{key: "session", format: "json", ref: "mass:session", label: null, description: null, content: "lazy"}]
  const registryMass = {key: "registry", format: "json", ref: "mass:registry", label: null, description: null, content: "lazy"} as const
  graph.template[provider] = {name: "Provider", fields: [{key: "registryMode", type: "string"}, {key: "sessionId", type: "string"}],
    superposition: [{name: "ready", transitions: null}], mass: [{key: "registry", format: "json"}], processes: []}
  graph.template[graph.root]!.matter![1] = {kind: "wimp", src: provider}
  delete graph.template[owner.meta]
  owner.meta = provider
  owner.state = "ready"
  owner.values = {registryMode: "owner", sessionId: null}
  owner.mass = [registryMass]
  chat.children = [{kind: "atom", ref: "atom:5", meta: provider, declaration: "#/template/@metafor~1chat/matter/0", state: "ready",
    values: {registryMode: "executor", sessionId: "native-session"}, mass: [registryMass]}]
  const registry = createProviderRegistry([{...binding, source: {kind: "native-bootstrap", assignmentId: binding.id, remoteGraph: "unknown"}, resolution: "exact",
    connection: "connected", capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: null, message: null}}])
  const session = {version: 1, provider: "qwen", binding, bindingId: binding.id, providerRef: "atom:5", sessionId: "native-session",
    messages: [{requestId: intent.id, role: "user", content: intent.prompt}], requests: [{...intent, state: "pending",
      providerRequest: JSON.stringify({...intent, sessionId: null, providerRef: "atom:5", expectedBinding: null})}]}
  const writes: unknown[] = []
  let snapshots = 0
  let frontier: MetaCausalFrontier = {cutId: "recovery-fixture", throughSequence: 20, retroactiveComplete: false}
  const peer = {async call<T>(_target: string, method: string, params: any): Promise<T> {
    if (method === READ_GRAPH_DELTA_METHOD) {
      if (race && snapshots > 0) chat.values.request = JSON.stringify({...intent, id: "other-request"})
      frontier = {...frontier, throughSequence: 20 + snapshots++}
      return structuredClone({contractVersion: 1, kind: "snapshot", reason: "initial", resolution: "exact",
        snapshot: {identity: {root: graph.root, digest: `sha256:${"a".repeat(64)}`, frontier}, graph}} satisfies ReadGraphDeltaReceipt) as T
    }
    if (method === ENERGY_MASS_RESULT_READ_METHOD) return {atom: params.atom, key: params.key, resolution: "exact", bytes: 100,
      content: {format: "json", present: true, value: structuredClone(params.key === "registry" ? registry : session)}} as T
    if (method === META_FIELD_VALUE_APPLY_METHOD) {
      writes.push(params)
      const next = frontier.throughSequence + 1
      return {contractVersion: 1, resolution: "exact", atom: params.atom, field: params.field,
        acceptance: {cutId: frontier.cutId, sequence: next, id: `${frontier.cutId}:${next}`}, frontier: {...frontier, throughSequence: next}} satisfies MetaFieldValueApplyReceipt as T
    }
    throw Error("No other operation is permitted")
  }}
  return {peer, actor, chat, session, writes, graph}
}

test("owner recovery changes only own Chat ack and rejects another or raced request before admission", async () => {
  const f = fixture(), before = structuredClone(f.session)
  expect(await recoverAgentChat(f.peer, {agentRef: f.actor.ref, requestId: "original"})).toMatchObject({atomRef: f.chat.ref, field: "ack", value: false, acceptance: "admitted"})
  expect(f.writes).toEqual([{contractVersion: 1, atom: {root: f.graph.root, ref: f.chat.ref, meta: f.chat.meta}, field: "ack", value: false,
    expectedFrontier: {cutId: "recovery-fixture", throughSequence: 21, retroactiveComplete: false}}])
  expect(f.session).toEqual(before)
  for (const mode of ["wrong-request", "raced-request"] as const) {
    const rejected = fixture(mode === "raced-request")
    await expect(recoverAgentChat(rejected.peer, {agentRef: rejected.actor.ref, requestId: mode === "wrong-request" ? "other-request" : "original"})).rejects.toMatchObject({code: "conflict"})
    expect(rejected.writes).toEqual([])
  }
})
