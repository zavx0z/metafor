import {expect, test} from "bun:test"
import {MetaFor} from "@metafor/dsl"
import recordConfiguration from "../configuration"
import type {MassHandle} from "@metafor/types/metafor/mass"
void MetaFor

const mass = () => {
  let data: unknown = null
  const handle: MassHandle = {readBytes: async () => new Uint8Array(), readText: async () => JSON.stringify(data), readJson: async () => data, write: async value => {data = structuredClone(value)}}
  return {configuration: handle, read: () => data}
}

test("workspace-capsule owns exact root identity, non-AI resource composition and server-only Processes", async () => {
  const meta = (await import("../meta")).default
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).json()
  expect(manifest.name).toBe("workspace-capsule")
  expect(meta.matter?.flatMap(child => child.kind === "wimp" ? [child.src] : [])).toEqual(["@internal/peer", "capsule", "@metafor/provider", "@metafor/agent-slot"])
  expect(meta.fields?.find(field => field.key === "agentEnabled")?.default).toBe(false)
  expect(meta.fields?.find(field => field.key === "openOnBirth")?.default).toBe(false)
  expect(meta.processes?.every(process => process.declaration.env?.join() === "server")).toBe(true)
  expect(meta.mass).toEqual([{key: "configuration", format: "json"}, {key: "imports", format: "json"}, {key: "providerRegistry", format: "json"}])
  expect(meta.fields?.find(field => field.key === "profileName")?.default).toBeUndefined()
  expect(meta.lifecycle).toEqual({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
})

test("configuration records immutable source with optional launch override and refuses missing sources before Mass write", async () => {
  const store = mass()
  const input = {profileName: "qwen-cdp", saveId: "saved-one", templatePath: null, mass: store, signal: new AbortController().signal}
  await recordConfiguration(input)
  expect(store.read()).toEqual({version: 1, root: "workspace-capsule", browser: "capsule", profileName: "qwen-cdp", saveId: "saved-one", templatePath: null})
  const templatePath = "browser-agent/08-codespace-audio-microphone-cdp.yaml"
  await recordConfiguration({...input, templatePath})
  const expected = {version: 1, root: "workspace-capsule", browser: "capsule", profileName: "qwen-cdp", saveId: "saved-one", templatePath}
  expect(store.read()).toEqual(expected)
  await expect(recordConfiguration({...input, saveId: null})).rejects.toThrow("immutable save")
  await expect(recordConfiguration({...input, saveId: "", templatePath})).rejects.toThrow("nonempty")
  await expect(recordConfiguration({...input, templatePath: "../outside.yaml"})).rejects.toThrow("template reference")
  expect(store.read()).toEqual(expected)
  await recordConfiguration({...input, saveId: null, templatePath})
  expect(store.read()).toMatchObject({saveId: null, templatePath})
  await expect(recordConfiguration({...input, profileName: null})).rejects.toThrow("explicit name")
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

test("explicit profile save emits only a correlated Capsule intention and waits for actual save completion", async () => {
  const meta = (await import("../meta")).default
  const ready = meta.superposition.find(state => state.name === "ready")!
  expect(ready.transitions).toMatchObject({opening: {input: {eq: "open"}}, saving: {input: {eq: "save"}, capsuleStatus: {eq: "running"}}})
  const saving = meta.processes!.find(process => process.key === "saving")!
  if (saving.declaration.type !== "action" || !saving.declaration.success) throw new Error("Save intention process is absent")
  expect(saving.declaration.action.src).toBe("@cosmos/peer-lifecycle")
  let patch: unknown
  const success = new Function(`return (${saving.declaration.success.src})`)()
  success({data: {request: "start", requestId: "save-owner-1"}, update: (value: unknown) => {patch = value}})
  expect(patch).toEqual({capsuleRequest: "save", capsuleRequestId: "save-owner-1", capsuleAck: false, capsuleError: null, input: null})
  expect(meta.superposition.find(state => state.name === "waiting-save")!.transitions).toMatchObject({
    "failed-capsule": {input: {null: true}, capsuleError: {null: false}, capsuleStatus: {eq: "failed"}},
    "save-refused": {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "running"}, capsuleError: {null: false}},
    "awaiting-oracle": {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "saved"}, capsuleError: {null: true}},
  })
})

test("network and Oracle become available with an assigned profile while default birth keeps Capsule unopened", async () => {
  const meta = (await import("../meta")).default
  expect(meta.superposition.find(state => state.name === "waiting-network")!.transitions).toMatchObject({
    "starting-capsule": {input: {null: true}, networkAck: {eq: true}, openOnBirth: {eq: true}, profileName: {null: false}},
    "deferring-profile": {input: {null: true}, networkAck: {eq: true}, openOnBirth: {eq: false}},
  })
  expect(meta.superposition.find(state => state.name === "deferring-profile")!.transitions).toHaveProperty("awaiting-oracle")
  expect(meta.superposition.find(state => state.name === "ready")!.transitions).toHaveProperty("opening", {input: {eq: "open"}})
})


test("closed reconfiguration preserves public request identity and waits for native Capsule completion", async () => {
  const meta = (await import("../meta")).default
  const {parseProfileReconfigurationInput} = await import("@metafor/types/metafor/profile-intent")
  const templatePath = "browser-agent/08-codespace-audio-microphone-cdp.yaml"
  const data = parseProfileReconfigurationInput("profile.reconfigure:" + JSON.stringify({id: "explicit-switch-1", templatePath}))
  expect(meta.fields?.at(-1)?.key).toBe("reconfigureTemplatePath")
  expect(meta.superposition.find(state => state.name === "ready")?.transitions).toHaveProperty("reconfiguring", {input: {startsWith: "profile.reconfigure:"}, capsuleStatus: {eq: "running"}})
  const process = meta.processes!.find(process => process.key === "reconfiguring")!.declaration
  if (process.type !== "action" || !process.success) throw new Error("Reconfiguration Process missing")
  let patch: unknown
  const success = new Function(`return (${process.success.src})`)()
  success({data, update: (value: unknown) => {patch = value}})
  expect(patch).toEqual({capsuleRequest: "reconfigure", capsuleRequestId: "explicit-switch-1", reconfigureTemplatePath: templatePath, capsuleAck: false, capsuleError: null, input: null})
  expect(() => parseProfileReconfigurationInput('profile.reconfigure:{"id":"bad","templatePath":"../escape.yaml"}')).toThrow("Invalid")
  expect(meta.superposition.find(state => state.name === "waiting-reconfiguration")?.transitions).toHaveProperty("awaiting-oracle", {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "running"}})
})
