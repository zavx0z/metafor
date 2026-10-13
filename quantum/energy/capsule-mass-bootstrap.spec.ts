import {expect, test} from "bun:test"
import {mkdtemp, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {EnergyMassCatalog, EnergyMassGate} from "./mass"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"

/** Actual Energy SDK handles and physical empty JSON key; native container access is explicitly absent. */
test("Capsule first birth guards physical empty Mass before JSON parsing and persists its own receipt through the SDK", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "capsule-empty-mass-")))
  // Each owner keeps its own compiler settings; this integration executes the
  // public Process export rather than importing Capsule's native program into
  // MetaFor's stricter TypeScript graph. Capsule verifies that export itself.
  const {default: prepare} = await import(new URL("../../../capsule/packages/runtime-prepare/index.ts", import.meta.url).href)
  const catalog = new EnergyMassCatalog(root)
  const keyId = "11111111-1111-4111-8111-111111111111"
  const receipt = catalog.handle({id: 1, keyId, format: "json"})
  const dataKey = "22222222-2222-4222-8222-222222222222"
  const gate = new EnergyMassGate()
  const data = catalog.handle({id: 2, keyId: dataKey, format: "directory"}, {gate, atom: 1, generation: gate.authorize(1, 2, dataKey)})
  const energy: {resource?: {lease: MassDirectoryLease}} = {}
  try {
    await catalog.write(keyId, "json", new Uint8Array())
    expect(await receipt.readText()).toBe("")
    await expect(receipt.readJson()).rejects.toThrow()
    const result = await prepare({value: {request: "start", requestId: "first-birth", profileName: "fresh-profile", saveId: null,
      templatePath: "browser-agent/03-desktop-audio-microphone.yaml", instanceId: null}, mass: {receipt, data}, energy, signal: new AbortController().signal},
    {instanceId: () => "owned-first", containers: {inspect: async () => {throw new Error("Native calls forbidden")}, stop: async () => {throw new Error("Native calls forbidden")}}})
    expect(result).toEqual({requestId: "first-birth", instanceId: "owned-first", phase: "prepared"})
    const expected = {version: 1, profileName: "fresh-profile", instanceId: "owned-first", templatePath: "browser-agent/03-desktop-audio-microphone.yaml"}
    expect(await receipt.readJson<typeof expected>()).toEqual(expected)
  } finally {await energy.resource?.lease.release(); await rm(root, {recursive: true, force: true})}
})
