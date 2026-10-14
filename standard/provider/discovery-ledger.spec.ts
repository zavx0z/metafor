import {expect, test} from "bun:test"
import {createProviderRegistry, parseProviderRegistry} from "@metafor/types/metafor/provider-validation"
import type {ProviderBinding, ProviderDiscoveryRequest, ProviderExecutionSettings} from "@metafor/types/metafor/providers"
import discover from "./discover"

test("full background discovery ledger admits registration, retains command replay and bounds subsequent observations", async () => {
  const binding: ProviderBinding = {id: "assigned-codex", service: "codex", host: "server", remotePeerId: "peer", executorId: "codex"}
  const qwen: ProviderBinding = {id: "ai-srv-qwen", service: "qwen", host: "server", remotePeerId: "ai-srv", executorId: "qwen"}
  const configuration: ProviderExecutionSettings = {schemaVersion: 1, revision: 0,
    connections: [{id: "native", label: "Native", enabled: true, provider: "codex", peer: {peerId: "peer", executorId: "codex"}}], general: {}, types: {}}
  let bytes = JSON.stringify(createProviderRegistry())
  let checks = 0, writes = 0, observations = 0
  const mass = {registry: {async readText() {return bytes}, async write(value: unknown) {writes++; bytes = JSON.stringify(value)}}}
  const check = async () => {
    checks++
    return {connection: "connected" as const, capabilities: {modelTurn: true, browserPreview: false, browserControl: false},
      checks: {status: "unknown" as const, checkedAt: 100, message: "Admission only; no resource creation or model prompt"}}
  }
  const run = (request: ProviderDiscoveryRequest) => discover({request: JSON.stringify(request), mass, signal: new AbortController().signal,
    resolveConnection: async () => binding, registrationCheck: check, check,
    source: {async read() {observations++; return {peers: [], remoteGraphs: []}}}})
  const commands: ProviderDiscoveryRequest[] = [
    {id: "peer-event:1:1", register: binding},
    {id: "saved-configuration", configure: configuration},
    {id: "explicit-check", check: "native"},
  ]
  const receipts = []
  for (const command of commands) {
    const result = await run(command)
    expect(result.discoveryError).toBeNull()
    receipts.push(result)
  }
  const initial = parseProviderRegistry(JSON.parse(bytes))
  const commandRows = structuredClone(initial.requests)
  initial.requests.push({id: "bootstrap-seed", revision: 0}, {id: "manual-observation", revision: 0})
  const backgroundRows = Array.from({length: 1024 - initial.requests.length}, (_, index) => ({id: `peer-event:1700000000000:${index + 1}`, revision: initial.revision}))
  initial.requests.push(...backgroundRows)
  bytes = JSON.stringify(parseProviderRegistry(initial))
  expect(initial.requests).toHaveLength(1024)
  const before = {checks, writes}
  const registration = {id: "register-ai-srv-qwen", register: qwen}
  const registered = await run(registration)
  expect(registered.discoveryError).toBeNull()
  expect({checks, writes}).toEqual({checks: before.checks + 1, writes: before.writes + 1})
  const current = parseProviderRegistry(JSON.parse(bytes))
  expect(current.entries.map(entry => entry.id)).toEqual([binding.id, qwen.id])
  expect(current.requests.filter(row => backgroundRows.some(background => background.id === row.id))).toEqual(backgroundRows.slice(-64))
  expect(current.requests.filter(row => commandRows.some(command => command.id === row.id))).toEqual(commandRows)
  expect(current.requests.some(row => row.id === "bootstrap-seed")).toBe(true)
  expect(current.requests.some(row => row.id === "manual-observation")).toBe(true)
  expect(current.requests).toHaveLength(70)
  const retainedBytes = bytes
  const afterRegistration = {checks, writes, observations}
  for (let index = 0; index < commands.length; index++) {
    expect((await run(commands[index]!)).discoveryResponse).toBe(receipts[index]!.discoveryResponse)
  }
  expect((await run(registration)).discoveryResponse).toBe(registered.discoveryResponse)
  for (const altered of [{id: commands[0]!.id, register: qwen}, {id: commands[1]!.id, configure: {...configuration, general: {connectionId: "native"}}},
    {id: commands[2]!.id, check: "other"}]) {
    expect((await run(altered)).discoveryError).toContain("identity conflicts")
  }
  expect({checks, writes, observations}).toEqual(afterRegistration)
  expect(bytes).toBe(retainedBytes)
  // Вытесненная read-only identity заново наблюдает мир, но не повторяет команду.
  const oldBackground = await run({id: backgroundRows[0]!.id})
  expect(oldBackground.discoveryError).toBeNull()
  expect(observations).toBe(1)
  const refreshed = parseProviderRegistry(JSON.parse(bytes))
  const tail = refreshed.requests.filter(row => /^peer-event:/.test(row.id) && !row.register && !row.configureHash && !row.check)
  expect(tail).toHaveLength(64)
  expect(tail.at(-1)?.id).toBe(backgroundRows[0]!.id)
  expect(refreshed.requests.filter(row => commandRows.some(command => command.id === row.id))).toEqual(commandRows)
  // Общий лимит сохраняется: настоящее заполнение командами не удаляет квитанции.
  refreshed.requests = Array.from({length: 1024}, (_, index) => ({id: `retained-check-${index}`, revision: refreshed.revision, check: "native"}))
  bytes = JSON.stringify(parseProviderRegistry(refreshed))
  const fullCommands = bytes
  const beforeRefusal = {checks, writes, observations}
  expect((await run({id: "new-register", register: qwen})).discoveryError).toContain("ledger is full")
  expect(bytes).toBe(fullCommands)
  expect({checks, writes, observations}).toEqual(beforeRefusal)
})
