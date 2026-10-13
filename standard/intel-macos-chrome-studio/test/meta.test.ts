import {expect, test} from "bun:test"
import {MetaFor} from "@metafor/dsl"
import recordConfiguration from "../configuration"
import baseline from "./fixture/root-0.1.8.json"
import {readFile} from "node:fs/promises"
import {evaluateMetaSource} from "../../../quantum/dark/load"
import {createPreparedDeclarationActivation} from "../../../quantum/dark/prepared-declarations"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "../../../shared/protocol/force/particle"
void MetaFor

test("Intel Mac root observes on birth and delegates explicit profile intents to actual chrome-studio Meta", async () => {
  const meta = (await import("../meta")).default
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json()
  expect(manifest.name).toBe("intel-macos-chrome-studio")
  expect(meta.matter?.flatMap(child => child.kind === "wimp" ? [child.src] : [])).toEqual(["@internal/peer", "chrome-studio", "@metafor/provider", "@metafor/agent-slot", "@metafor/agent-slot", "@metafor/agent-slot"])
  expect(meta.fields?.find(field => field.key === "agentEnabled")?.default).toBe(false)
  expect(meta.processes?.every(process => process.declaration.env?.join() === "server")).toBe(true)
  const connection = meta.processes?.find(process => process.key === "connecting")!
  if (!("success" in connection.declaration)) throw new Error("Connection action missing")
  expect(connection.declaration.success?.src).toContain('studioRequest: "observe"')
  const disconnect = meta.processes?.find(process => process.key === "disconnecting")!
  if (!("success" in disconnect.declaration)) throw new Error("Disconnect action missing")
  expect(disconnect.declaration.success?.src).toContain('studioRequest: "disconnect"')
  expect(disconnect.declaration.success?.src).not.toContain('studioRequest: "close"')
})

test("Mac root stores profile selection without reading or opening it", async () => {
  let stored: unknown = null
  const mass = {configuration: {readJson: async () => stored, readText: async () => "", readBytes: async () => new Uint8Array(), write: async (value: unknown) => {stored = value}}}
  await recordConfiguration({profileName: "browser-bridge-rtc", saveId: "immutable-save", templatePath: null, mass, signal: new AbortController().signal})
  expect(stored).toEqual({version: 1, root: "intel-macos-chrome-studio", browser: "chrome-studio", profileName: "browser-bridge-rtc", saveId: "immutable-save", templatePath: null})
})


test("cold started invalidates stale lease observations from every stable/awaiting state", async () => {
  const meta = (await import("../meta")).default
  const stable = meta.superposition.filter(state => state.name === "ready" || state.name === "stopped" || state.name === "prepared" || state.name === "awaiting-oracle" || state.name.startsWith("waiting-"))
  for (const state of stable) {
    const transitions = new Map(Object.entries(state.transitions ?? {}))
    expect(transitions.get("starting-network")).toEqual({input: {eq: "started"}})
  }
  const start = meta.processes?.find(process => process.key === "starting-network")!
  if (!("success" in start.declaration) || !start.declaration.success) throw new Error("Start success missing")
  let written: Record<string, unknown> = {}
  const apply = new Function(`return (${start.declaration.success.src})`)()
  apply({data: {request: "start", requestId: "fresh-incarnation"}, update: (values: Record<string, unknown>) => {written = values}})
  expect(written).toMatchObject({networkRequest: "start", networkRequestId: "fresh-incarnation", networkAck: false, oracleReady: false, oracleError: null, input: null})
  const awaiting = meta.superposition.find(state => state.name === "awaiting-oracle")!
  const transitions = new Map(Object.entries(awaiting.transitions ?? {}))
  expect(transitions.get("ready")).toEqual({input: {null: true}, oracleReady: {eq: true}})
})

test("browser slot appends independent fields and shares only the Provider registry with the retained assistant", async () => {
  const meta = (await import("../meta")).default
  expect(meta.fields.slice(-7, -1).map(field => field.key)).toEqual(["browserAgentEnabled", "browserTask", "browserAnswer", "browserStatus", "browserError", "browserProviderBinding"])
  expect(meta.fields.find(field => field.key === "browserAgentEnabled")?.default).toBe(false)
  const assistant = meta.matter![3]!, browser = meta.matter![4]!
  if (assistant.kind !== "wimp" || browser.kind !== "wimp" || !assistant.fieldsBinding || !browser.fieldsBinding || typeof assistant.fieldsBinding === "string" || typeof browser.fieldsBinding === "string") throw new Error("Expected independent connection slots")
  const values: Record<string, unknown> = {agentEnabled: true, providerBinding: "legacy-codex", task: "retained-task", browserAgentEnabled: false, browserProviderBinding: null}
  const resolve = (binding: typeof assistant.fieldsBinding) => {
    const keys = Array.isArray(binding.data) ? binding.data : [binding.data!]
    return new Function("_", `return (${binding.expr})`)(keys.map(key => values[key])) as Record<string, unknown>
  }
  expect(browser.fieldsBinding.data).toEqual(["browserTask", "browserAnswer", "browserStatus", "browserError", "browserProviderBinding", "browserAgentEnabled"])
  expect(browser.massBinding).toEqual(assistant.massBinding)
  const old = resolve(assistant.fieldsBinding), next = resolve(browser.fieldsBinding)
  expect(old).toMatchObject({enabled: true, providerBinding: "legacy-codex", task: "retained-task"})
  expect(next).toMatchObject({enabled: false, providerBinding: null, providerRegistryShared: true})
  const originalConfiguration = JSON.parse(String(old.configuration)), browserConfiguration = JSON.parse(String(next.configuration))
  expect(originalConfiguration.id).toBe("assistant")
  expect(browserConfiguration.id).toBe("browser-assistant")
  expect(browserConfiguration.tools).toEqual(originalConfiguration.tools)
  values.browserAgentEnabled = true; values.browserTask = "new-browser-task"; values.browserProviderBinding = "mac-deepseek"
  expect(resolve(browser.fieldsBinding)).toMatchObject({enabled: true, task: "new-browser-task", providerBinding: "mac-deepseek"})
  expect(resolve(assistant.fieldsBinding)).toEqual(old)
})

test("exact verified installed root1.8 remains append compatible through the normal prepared activation planner without SQLite", async () => {
  expect(baseline).toMatchObject({owner: "intel-macos-chrome-studio", version: "0.1.8", sha256: "c387a29b58f44655117fcd3472fffc2c56871022d7b540e528289bef26a4b28f", size: 17095})
  const before = baseline.meta as unknown as MetaDSL
  const path = new URL("../meta.ts", import.meta.url).pathname
  const after = await evaluateMetaSource(await readFile(path, "utf8"), {sourcePath: path})
  expect(after.fields.slice(0, before.fields.length)).toEqual([...before.fields])
  expect(after.matter!.slice(0, before.matter!.length)).toEqual([...before.matter!])
  const root = parseMetaAddress("intel-macos-chrome-studio")!
  const stubs = new Map((before.matter ?? []).flatMap(particle => particle.kind === "wimp" ? [[parseMetaAddress(particle.src)!, {
    name: particle.src, fields: [], superposition: [], processes: [], reactions: [], mass: [], matter: [],
  } as MetaDSL] as const] : []))
  let sequence = 10, installed = false
  const accepted: Particle[] = []
  const apply = createPreparedDeclarationActivation({
    async gate(action) {return action()}, async read() {return {root, frontier: {cutId: "root-append-test", throughSequence: sequence}, busy: false,
      canonical: {root, declarations: [{address: root, meta: before}, ...[...stubs].map(([address, meta]) => ({address, meta}))]}}},
    async accept(particle) {accepted.push(particle); sequence++}, async settle() {return {cutId: "root-append-test", throughSequence: sequence}},
    closeAdmission() {}, openAdmission() {}, install() {installed = true},
  })
  const request = {operationId: "append-browser-slot", releaseDigest: "a".repeat(64), root, expectedFrontier: {cutId: "root-append-test", throughSequence: 10},
    readMeta: async (address: string) => address === root ? after : stubs.get(parseMetaAddress(address)!)!}
  const receipt = await apply(request)
  expect(receipt.phase).toBe("complete")
  expect(installed).toBeTrue()
  expect(accepted.every(particle => particle.op !== "remove" && (particle.value as {wimp: string}).wimp === root)).toBeTrue()
  expect(accepted.filter(particle => particle.path === "field").map(particle => [particle.op, (particle.value as {id: number}).id])).toEqual(Array.from({length: 7}, (_, index) => ["add", before.fields.length + index + 1]))
  expect(accepted.filter(particle => particle.path === "matter")).toHaveLength(2)
  expect(accepted.find(particle => particle.path === "matter")).toMatchObject({op: "add", value: {id: 5, position: 4, src: "@metafor/agent-slot"}})
  expect(accepted.some(particle => particle.path === "mass")).toBeFalse()
  const count = accepted.length
  expect(await apply(request)).toEqual(receipt)
  expect(accepted).toHaveLength(count)
  await expect(apply({...request, operationId: "invalid-reorder", expectedFrontier: {cutId: "root-append-test", throughSequence: sequence},
    readMeta: async (address: string) => address === root ? {...after, fields: after.fields.toReversed()} : stubs.get(parseMetaAddress(address)!)!})).rejects.toThrow("local identities")
  expect(accepted).toHaveLength(count)
})


test("local Mac browser slot appends one disabled switch and owns task/answer/provider fields without reusing retained browser links", async () => {
  const meta = (await import("../meta")).default
  expect(meta.fields.at(-1)).toMatchObject({key: "localBrowserAgentEnabled", type: "boolean", default: false})
  const assistant = meta.matter![3]!, browser = meta.matter![4]!, local = meta.matter![5]!
  if (local.kind !== "wimp" || assistant.kind !== "wimp" || browser.kind !== "wimp" || !local.fieldsBinding || typeof local.fieldsBinding === "string") throw new Error("Expected one appended local slot")
  expect(local.src).toBe("@metafor/agent-slot")
  expect([local.fieldsBinding.data].flat()).toEqual(["localBrowserAgentEnabled"])
  const binding = local.fieldsBinding
  const resolve = (enabled: boolean) => new Function("_", `return (${binding.expr})`)([enabled]) as Record<string, unknown>
  const off = resolve(false), on = resolve(true)
  expect(off).toMatchObject({enabled: false, task: null, answer: null, status: "idle", error: null, providerRegistryShared: true})
  expect(on).toMatchObject({enabled: true, task: null, answer: null, status: "idle", error: null})
  expect(Object.hasOwn(on, "providerBinding")).toBe(false)
  expect(local.massBinding).toEqual(browser.massBinding)
  expect(local.massBinding).toEqual(assistant.massBinding)
  const configuration = JSON.parse(String(on.configuration))
  expect(configuration.id).toBe("mac-browser")
  expect(configuration.tools.map((tool: {name: string}) => tool.name)).toEqual(["bun.evaluate", "scenario.run", "codespace.status", "codespace.start"])
  expect(configuration.displays).toEqual([{id: "providers", source: {kind: "mass", key: "providerRegistry"}}])
})

test("verified installed Root 0.1.12 preserves every existing field, Matter and process identity when adding the local browser slot", async () => {
  const baseline = (await import("./fixture/root-0.1.12.json")).default
  const before = baseline.meta as unknown as MetaDSL
  const sourcePath = new URL("../meta.ts", import.meta.url).pathname
  const after = await evaluateMetaSource(await readFile(sourcePath, "utf8"), {sourcePath})
  expect(baseline).toMatchObject({version: "0.1.12", sha256: "e05d08ba92822ccd934587aae2410eb546cd177cb05717e2c4866f8f98b12176", size: 19920})
  expect(after.fields.slice(0, before.fields.length)).toEqual([...before.fields])
  expect(after.fields).toHaveLength(before.fields.length + 1)
  expect(after.matter!.slice(0, before.matter!.length)).toEqual([...before.matter!])
  expect(after.matter).toHaveLength(before.matter!.length + 1)
  expect(after.processes?.map(row => [row.key, row.declaration.type])).toEqual(before.processes?.map(row => [row.key, row.declaration.type]))
  expect(after.mass).toEqual(before.mass)
  expect(after.lifecycle).toEqual(before.lifecycle)
  expect(after.superposition).toEqual(before.superposition)
})
