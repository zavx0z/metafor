import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_SOURCE_READ_CAPABILITY,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import {sourceRevision} from "../../create-metafor/src/source.ts"
import {
  MetaAuthoringRegistry,
  metaAuthoringCapabilitiesForScopes,
  readMetaAuthoringLocalConfiguration,
} from "./registry.ts"

const LADA = parseMetaAddress("zavx0z/lada")!
const CHAT = parseMetaAddress("zavx0z/lada-chat")!
const SOURCE = "owner/codex"

describe("Meta authoring capability and source registry", () => {
  let root: string
  let paths: Map<MetaAddress, string>
  let registry: MetaAuthoringRegistry

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "metafor-authoring-registry-"))
    paths = new Map([
      [LADA, join(root, LADA, "meta.ts")],
      [CHAT, join(root, CHAT, "meta.ts")],
    ])
    for (const [address, path] of paths) {
      await mkdir(dirname(path), {recursive: true})
      await writeFile(path, `${address}\n`)
    }
    registry = new MetaAuthoringRegistry(
      [[SOURCE, metaAuthoringCapabilitiesForScopes([LADA, CHAT])]],
      (address) => paths.get(address) ?? join(root, address, "meta.ts"),
    )
  })

  afterEach(async () => {
    await rm(root, {recursive: true, force: true})
  })

  test("requires one explicit local source identity and exact unique scopes", () => {
    expect(readMetaAuthoringLocalConfiguration({})).toBeNull()
    expect(readMetaAuthoringLocalConfiguration({
      META_AUTHORING_RPC_SOURCE: SOURCE,
      META_AUTHORING_SCOPES: `${LADA}, ${CHAT}`,
      META_AUTHORING_CREATE_SCOPES: CHAT,
    })).toEqual({source: SOURCE, scopes: [LADA, CHAT], createScopes: [CHAT]})
    expect(() => readMetaAuthoringLocalConfiguration({
      META_AUTHORING_RPC_SOURCE: SOURCE,
    })).toThrow("must be configured together")
    expect(() => readMetaAuthoringLocalConfiguration({
      META_AUTHORING_RPC_SOURCE: SOURCE,
      META_AUTHORING_SCOPES: `${LADA},${LADA}`,
      META_AUTHORING_CREATE_SCOPES: LADA,
    })).toThrow("unique Meta addresses")
    expect(() => readMetaAuthoringLocalConfiguration({
      META_AUTHORING_RPC_SOURCE: SOURCE,
      META_AUTHORING_SCOPES: LADA,
      META_AUTHORING_CREATE_SCOPES: CHAT,
    })).toThrow("must be a subset")
  })

  test("discovers only grants bound to the routed source identity", () => {
    const known = registry.readCapabilities({contractVersion: 1}, SOURCE)
    const unknown = registry.readCapabilities({contractVersion: 1}, "other/client")

    expect(known.contractVersion).toBe(META_AUTHORING_CONTRACT_VERSION)
    expect(known.capabilities.map(({capability}) => capability)).toEqual([
      "meta.create",
      "meta.declaration.write",
      "meta.matter.write",
      "meta.source.read",
    ])
    expect(known.capabilities.every(({scopes}) => scopes.includes(LADA) && scopes.includes(CHAT))).toBe(true)
    expect(unknown.capabilities).toEqual([])
  })

  test("reads only scoped meta.ts revisions without exposing source paths or bytes", async () => {
    const result = await registry.readSourceRevisions({
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: [LADA, CHAT],
    }, SOURCE)

    expect(result).toEqual({
      contractVersion: 1,
      sources: [
        {address: LADA, revision: sourceRevision(`${LADA}\n`)},
        {address: CHAT, revision: sourceRevision(`${CHAT}\n`)},
      ],
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain("zavx0z/lada\n")
  })

  test("rejects denied and missing sources without leaking the filesystem target", async () => {
    await expect(registry.readSourceRevisions({
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: [LADA],
    }, "other/client")).rejects.toThrow("capability_denied")

    const missing = parseMetaAddress("zavx0z/missing")!
    const scoped = new MetaAuthoringRegistry(
      [[SOURCE, metaAuthoringCapabilitiesForScopes([missing])]],
      () => join(root, "private", "missing", "meta.ts"),
    )
    await expect(scoped.readSourceRevisions({
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: [missing],
    }, SOURCE)).rejects.toThrow("Source revision is unavailable: zavx0z/missing")
    await expect(scoped.readSourceRevisions({
      contractVersion: 1,
      capability: META_SOURCE_READ_CAPABILITY,
      addresses: [missing],
    }, SOURCE)).rejects.not.toThrow(root)
  })
})
