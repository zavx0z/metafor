import {afterEach, describe, expect, test} from "bun:test"
import {unlink} from "node:fs/promises"
import {join} from "node:path"
import {EnergyMassCatalog, EnergyMassGate} from "./mass.ts"

describe("Energy Mass file catalog", () => {
  const key = "11111111-1111-4111-8111-111111111111"
  const binary = "22222222-2222-4222-8222-222222222222"

  afterEach(async () => {
    const catalog = new EnergyMassCatalog()
    await Promise.all([key, binary].map(async (id) => await unlink(join(catalog.root, id)).catch(() => undefined)))
  })

  test("round-trips JSON and raw bytes through flat key files", async () => {
    const catalog = new EnergyMassCatalog()
    const json = catalog.handle({id: 1, keyId: key, format: "json", mime: "application/json"})
    const raw = catalog.handle({id: 2, keyId: binary, format: "binary", mime: "application/octet-stream"})
    await json.write({ready: true})
    await raw.write(new Uint8Array([0, 255, 4]))
    expect(await json.readJson<{ready: boolean}>()).toEqual({ready: true})
    expect([...await raw.readBytes()]).toEqual([0, 255, 4])
    expect(json.mime).toBe("application/json")
    expect(catalog.root.endsWith("/mass")).toBe(true)
  })

  test("rejects non-Boundary key paths", async () => {
    const catalog = new EnergyMassCatalog()
    await expect(catalog.write("../escape", "no")).rejects.toThrow("Boundary-issued")
    await expect(catalog.write("/absolute", "no")).rejects.toThrow("Boundary-issued")
  })

  test("rejects only a revoked child generation", async () => {
    const catalog = new EnergyMassCatalog()
    const gate = new EnergyMassGate()
    const childGeneration = gate.authorize(2, 1, key)
    const parentGeneration = gate.authorize(1, 1, key)
    const child = catalog.handle({id: 1, keyId: key, format: "json", mime: "application/json"}, {gate, atom: 2, generation: childGeneration})
    const parent = catalog.handle({id: 1, keyId: key, format: "json", mime: "application/json"}, {gate, atom: 1, generation: parentGeneration})
    gate.revoke(2, 1, key, childGeneration)
    await expect(child.readBytes()).rejects.toThrow("not live")
    await expect(parent.readBytes()).resolves.toBeInstanceOf(Uint8Array)
  })

  test("supersedes and fences only the exact child handle generation", async () => {
    const catalog = new EnergyMassCatalog()
    const gate = new EnergyMassGate()
    const parentGeneration = gate.authorize(1, 1, key)
    const oldChildGeneration = gate.authorize(2, 1, key)
    const nextChildGeneration = gate.authorize(2, 1, key)
    const artifact = {id: 1, keyId: key, format: "json" as const, mime: "application/json"}
    const parent = catalog.handle(artifact, {gate, atom: 1, generation: parentGeneration})
    const oldChild = catalog.handle(artifact, {gate, atom: 2, generation: oldChildGeneration})
    const child = catalog.handle(artifact, {gate, atom: 2, generation: nextChildGeneration})

    await expect(oldChild.readBytes()).rejects.toThrow("not live")
    await expect(child.readBytes()).resolves.toBeInstanceOf(Uint8Array)
    await expect(parent.readBytes()).resolves.toBeInstanceOf(Uint8Array)
    gate.fence(2, 1, key)
    await expect(child.write({blocked: true})).rejects.toThrow("not live")
    await expect(parent.write({still: "writable"})).resolves.toBeUndefined()
    gate.release(2, 1, key)
    await expect(child.readBytes()).resolves.toBeInstanceOf(Uint8Array)
  })
})
