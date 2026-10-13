import {expect, test} from "bun:test"
import {createProviderRegistry, parseProviderRegistry, parseProviderExecutionSettings} from "@metafor/types/metafor/provider-validation"
import type {ProviderBinding, ProviderExecutionSettings} from "@metafor/types/metafor/providers"
import discover from "./discover"
import {resolveProviderBinding} from "./catalog"

const binding: ProviderBinding = {id: "assigned-codex", service: "codex", host: "server", remotePeerId: "peer", executorId: "codex"}
const initial: ProviderExecutionSettings = {schemaVersion: 1, revision: 0,
  connections: [{id: "my-codex", label: "Мой Codex", enabled: true, provider: "codex", peer: {peerId: "peer", executorId: "codex"}}],
  general: {connectionId: "my-codex"}, types: {Component: {model: "model-a"}}}
function fixture() {
  let bytes = JSON.stringify(createProviderRegistry()), checks = 0, writes = 0
  let unavailable = false
  const mass = {registry: {async readText() {return bytes}, async write(value: unknown) {writes++; bytes = JSON.stringify(value)}}}
  const run = (request: object, registryMode = "owner") => discover({request: JSON.stringify(request), mass, registryMode, signal: new AbortController().signal,
    resolveConnection: async () => {if (unavailable) throw new Error("Host unavailable"); return binding},
    registrationCheck: async () => {checks++; return {connection: "connected", capabilities: {modelTurn: true, browserPreview: false, browserControl: false},
      checks: {status: "unknown", checkedAt: 100, message: "Admission only; no session or prompt"}}}})
  return {run, mass, read: () => parseProviderRegistry(JSON.parse(bytes)), counts: () => ({checks, writes}), fail() {unavailable = true}}
}

test("configuration CRUD and typed defaults survive Mass restoration; replay neither checks resources nor writes again", async () => {
  const f = fixture(), request = {id: "create", configure: initial}
  expect((await f.run(request)).discoveryError).toBeNull()
  const saved = f.read()
  expect(saved.settings).toMatchObject({selectedId: binding.id, configuration: {...initial, revision: 1}, connectionBindings: {"my-codex": binding.id}})
  expect(() => resolveProviderBinding(saved, binding.id)).toThrow()
  expect((await f.run(request)).discoveryError).toBeNull()
  expect(f.counts()).toEqual({checks: 0, writes: 1})
  expect((await f.run({id: "probe", check: "my-codex"})).discoveryError).toBeNull()
  expect(resolveProviderBinding(f.read(), binding.id)).toEqual(binding)
  const restored = parseProviderRegistry(JSON.parse(await f.mass.registry.readText()))
  expect(restored.settings.configuration?.types).toEqual(initial.types)
  expect(saved.requests[0]).toMatchObject({id: "create", configureHash: expect.stringMatching(/^[a-f0-9]{64}$/)})
  expect((await f.run({id: "rename", configure: {...initial, revision: 1, connections: [{...initial.connections[0]!, label: "Новое название"}]}})).discoveryError).toBeNull()
  expect(f.read().settings.configuration?.connections[0]?.label).toBe("Новое название")
  expect((await f.run({id: "disable", configure: {...initial, revision: 2, connections: [{...initial.connections[0]!, enabled: false}]}})).discoveryError).toBeNull()
  expect(f.read().settings.selectedId).toBeNull()
  expect(() => resolveProviderBinding(f.read(), binding.id)).toThrow("disabled")
  expect((await f.run({id: "delete", configure: {...initial, revision: 3, connections: [], general: {}, types: {}}})).discoveryError).toBeNull()
  expect(f.read().settings.configuration?.connections).toEqual([])
  expect(() => resolveProviderBinding(f.read(), binding.id)).toThrow("removed")
})

test("unavailable assignments remain saved with failed check; probe preserves configuration revision and does not affect other rows", async () => {
  const f = fixture()
  await f.run({id: "create", configure: initial})
  const revision = f.read().settings.configuration!.revision
  await f.run({id: "probe", check: "my-codex"})
  expect(f.read().settings.configuration?.revision).toBe(revision)
  f.fail()
  expect((await f.run({id: "probe-failure", check: "my-codex"})).discoveryError).toBeNull()
  expect(f.read().settings.connectionChecks?.["my-codex"]?.status).toBe("failed")
  expect(f.read().settings.connectionBindings?.["my-codex"]).toBeNull()
  expect(f.read().settings.configuration?.connections).toEqual(initial.connections)
  expect((await f.run({id: "save-unavailable", configure: {...initial, revision}})).discoveryError).toBeNull()
  expect(f.read().settings.configuration?.revision).toBe(revision + 1)
})

test("stale revision, replay with different content, executor writes and secret/unknown configuration keys are refused", async () => {
  const f = fixture()
  await f.run({id: "create", configure: initial})
  const before = f.counts()
  for (const request of [{id: "stale", configure: initial}, {id: "create", configure: {...initial, general: {}}},
    {id: "mixed", configure: {...initial, revision: 1}, check: "my-codex"},
    {id: "secret", configure: {...initial, connections: [{...initial.connections[0], token: "private"}]}}]) {
    expect((await f.run(request)).discoveryError).not.toBeNull()
  }
  expect((await f.run({id: "executor", configure: {...initial, revision: 1}}, "executor")).discoveryError).toContain("Executor")
  expect(f.counts()).toEqual(before)
  expect(() => parseProviderExecutionSettings({...initial, general: {connectionId: "unknown"}})).toThrow()
  expect(() => parseProviderExecutionSettings({...initial, connections: [{id: "url", provider: "capsule", label: "URL", enabled: true,
    endpoint: {url: "https://user:secret@example.com", service: "chatgpt", profile: "profile"}}]})).toThrow()
})
