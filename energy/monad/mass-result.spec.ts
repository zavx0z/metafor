import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {DarkForceHistoryReadReceipt} from "@metafor/types/metafor/observation"
import {EnergyCatalogStore} from "../catalog.ts"
import {EnergyMassCatalog, EnergyMassGate} from "../mass.ts"
import {EnergyMassResultReadService} from "./mass-result.ts"

const roots: string[] = []
const ROOT = parseMetaAddress("owner/root")!
const CHILD = parseMetaAddress("owner/child")!
const KEY_ID = "33333333-3333-4333-8333-333333333333"

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
})

const frontier = (): DarkForceHistoryReadReceipt => ({
  contractVersion: 1,
  resolution: "exact",
  frontier: {cutId: "mass-cut", throughSequence: 12, retroactiveComplete: false},
  range: null,
  entries: [],
})

const harness = async (
  value: unknown = {ok: true},
  format: "json" | "binary" = "json",
) => {
  const root = mkdtempSync(join(tmpdir(), "metafor-mass-rpc-"))
  roots.push(root)
  const catalog = new EnergyCatalogStore()
  catalog.apply({
    part: "graviton", op: "add", path: "atom/1", ts: 0,
    value: {
      atom: {id: 1, parentAtom: null, parentTopology: null, wimp: ROOT, position: 0},
      values: [], valueRecords: [], valueItems: [], state: null,
    },
  })
  catalog.apply({
    part: "graviton", op: "add", path: "atom/2", ts: 0,
    value: {
      atom: {id: 2, parentAtom: 1, parentTopology: null, wimp: CHILD, position: 0},
      mass: [{id: 7, key: "profile", keyId: KEY_ID, format, label: null, description: null}],
      values: [], valueRecords: [], valueItems: [], state: null,
    },
  })
  const files = new EnergyMassCatalog(root)
  const gate = new EnergyMassGate()
  gate.authorize(2, 7, KEY_ID)
  await files.write(
    KEY_ID,
    format,
    format === "binary" && value instanceof Uint8Array ? value : JSON.stringify(value),
  )
  return {catalog, files, gate, service: new EnergyMassResultReadService(catalog, files, gate, async () => frontier())}
}

const request = () => ({
  contractVersion: 1 as const,
  atom: {root: ROOT, pointer: "/runtime/roots/0/children/0" as const, meta: CHILD},
  key: "profile",
  maxBytes: 4096,
})

describe("Energy Mass result RPC projection", () => {
  test("resolves a public Graph locator and returns bounded JSON with digest and frontier", async () => {
    const {service} = await harness({answer: 42})
    const result = await service.read(request())
    expect(result).toMatchObject({
      contractVersion: 1,
      resolution: "exact",
      frontier: {cutId: "mass-cut", throughSequence: 12},
      atom: request().atom,
      key: "profile",
      bytes: 13,
      content: {format: "json", present: true, value: {answer: 42}},
    })
    expect(result.digest).toMatch(/^sha256:[a-f0-9]{64}$/)
    await expect(service.read({...request(), expectedDigest: result.digest})).resolves.toMatchObject({digest: result.digest})
  })

  test("rejects stale locator, undeclared key, digest mismatch and oversized content", async () => {
    const {service} = await harness({long: "value"})
    await expect(service.read({...request(), atom: {...request().atom, meta: ROOT}})).rejects.toThrow("stale")
    await expect(service.read({...request(), key: "missing"})).rejects.toThrow("not declared")
    await expect(service.read({...request(), expectedDigest: `sha256:${"0".repeat(64)}`})).rejects.toThrow("digest mismatch")
    await expect(service.read({...request(), maxBytes: 2})).rejects.toThrow("exceeds 2 bytes")
  })

  test("returns binary content only as bounded base64", async () => {
    const {service} = await harness(new Uint8Array([0, 255, 4]), "binary")
    await expect(service.read(request())).resolves.toMatchObject({
      bytes: 3,
      content: {format: "binary", base64: "AP8E"},
    })
  })

  test("does not read a Mass identity while Boundary has fenced it", async () => {
    const {service, gate} = await harness()
    gate.fence(2, 7, KEY_ID)
    await expect(service.read(request())).rejects.toThrow("temporarily fenced")
  })
})
