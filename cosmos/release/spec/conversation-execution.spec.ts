import {expect, test} from "bun:test"
import {createProviderRegistry} from "@metafor/types/metafor/provider-validation"
import type {RuntimeAtom} from "@metafor/types/metafor/graph"
import {createConversationExecutionResolver} from "../server/conversation-execution"
import {agentWorkspaceGraph} from "./agent-graph-fixture"

test("Cosmos показывает peerless default для исправления без запуска и разрешает явный peer, сохраняя native pin", async () => {
  const graph = agentWorkspaceGraph()
  const room = graph.runtime.roots[0] as RuntimeAtom
  const owner = room.children![1] as RuntimeAtom
  owner.meta = "@metafor/provider" as RuntimeAtom["meta"]
  owner.values = {registryMode: "owner"}
  owner.mass = [{ref: "mass:registry", key: "registry", format: "json", label: null, description: null, content: "lazy"}]
  const registry = createProviderRegistry()
  const checks = {status: "unknown" as const, checkedAt: 1, message: null}
  registry.entries = [{id: "native-qwen", service: "qwen", host: "ai-srv", remotePeerId: "ai-qwen", executorId: "browser", assignmentId: "qwen",
    source: {kind: "native-bootstrap", assignmentId: "qwen", remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
    capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks}]
  registry.settings = {selectedId: null, configuration: {schemaVersion: 1, revision: 1,
    connections: [{id: "legacy-codex", label: "Codex", enabled: true, provider: "codex"},
      {id: "qwen", label: "Qwen", enabled: true, provider: "capsule", endpoint: {url: "http://100.89.87.44:17777", profile: "ai-qwen", service: "qwen"}, peer: {peerId: "ai-qwen", executorId: "browser"}}],
    general: {connectionId: "legacy-codex"}, types: {}}, connectionBindings: {"legacy-codex": null, qwen: "native-qwen"}, connectionChecks: {"legacy-codex": {status: "unknown", checkedAt: null, message: null}, qwen: checks}}
  const methods: string[] = []
  let readGate: Promise<void> | undefined
  const resolve = createConversationExecutionResolver({async call<T>(_target: string, method: string): Promise<T> {
    methods.push(method)
    await readGate
    return {atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, key: "registry", resolution: "exact", bytes: 100,
      content: {format: "json", present: true, value: registry}} as T
  }}, async () => ({graph, atom: room}))
  const input = {subject: {address: JSON.stringify(["verse", "atom:1"]), label: "Room", cwd: "/tmp"}, executorId: "executor", selection: {}}
  const initial = await resolve(input)
  expect(initial.effective.connectionId).toBe("legacy-codex")
  expect(initial.connections.find(value => value.id === "legacy-codex")!.enabled).toBe(false)
  expect(initial.connections.find(value => value.id === "qwen")!.enabled).toBe(true)
  expect((await resolve({...input, selection: {connectionId: "qwen"}})).effective.connectionId).toBe("qwen")
  expect((await resolve({...input, pinnedConnectionId: "qwen"})).effective.connectionId).toBe("qwen")
  await expect(resolve({...input, pinnedConnectionId: "qwen", selection: {connectionId: "legacy-codex"}})).rejects.toThrow("несовместимое")
  await expect(resolve({...input, selection: {approvalMode: "scoped-autonomous"}})).rejects.toThrow("не авторизован")
  expect(registry.settings.configuration!.general.connectionId).toBe("legacy-codex")
  expect(new Set(methods)).toEqual(new Set(["energy.mass.result.read"]))
  methods.length = 0
  const gate = Promise.withResolvers<void>()
  readGate = gate.promise
  const parallel = [resolve(input), resolve(input), resolve(input)]
  await Bun.sleep(0)
  expect(methods).toEqual(["energy.mass.result.read"])
  gate.resolve()
  expect((await Promise.all(parallel)).map(value => value.effective.connectionId)).toEqual(["legacy-codex", "legacy-codex", "legacy-codex"])
  readGate = undefined
  await resolve(input)
  expect(methods).toHaveLength(2)
})
