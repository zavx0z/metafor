import {afterEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_APPLY_METHOD,
  META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  META_DECLARATION_WRITE_CAPABILITY,
  type MetaAuthoringCapability,
  type MetaDeclarationRequest,
} from "@metafor/types/metafor/authoring"
import {parseMetaAddress, type MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import {sourceForceMessage} from "shared/protocol/force/message"
import {open, type BoundaryDatabase} from "../../boundary/sqlite.ts"
import {sourceRevision} from "../../create-metafor/src/source.ts"
import {evaluateMetaSource} from "../load.ts"
import {DarkForceHistory} from "../force/history.ts"
import {
  DeclarationAuthoringService,
  type DeclarationAuthoringMetaReader,
} from "./declaration.ts"

const ROOT = parseMetaAddress("example/declaration-root")!
const RPC_SOURCE = "test/declaration-authoring"

const directories: string[] = []
const boundaries: BoundaryDatabase[] = []

afterEach(async () => {
  for (const boundary of boundaries.splice(0)) await boundary.close()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})))
})

const metaSource = (): string => `export default MetaFor("Declaration", {desc: ""})
  .fields((field) => ({}))
  .superposition({})
  .mass((mass) => ({}))
  .energy()
  .processes(() => [])
  .reactions((reaction) => [])
  .matter(({html}) => html\`\`)
  .bulk()
`

const revision = async (path: string) => sourceRevision(await readFile(path))

describe("Declaration authoring service", () => {
  test("accepts Field and State through one RPC, projects source and repeats from existing Force history", async () => {
    const root = await mkdtemp(join(tmpdir(), "metafor-declaration-authoring-"))
    directories.push(root)
    const targetPath = join(root, "cluster", ROOT, "meta.ts")
    await mkdir(dirname(targetPath), {recursive: true})
    await writeFile(targetPath, metaSource())
    const boundary = await open(":memory:")
    boundaries.push(boundary)
    await boundary.materialize({parts: [{
      part: "inflaton", op: "add", path: "wimp", by: "dark", ts: 1,
      value: {src: ROOT, name: "Declaration", desc: null},
    }]})
    const history = new DarkForceHistory(join(root, "history", "v1"), {
      cutId: "declaration-authoring-test",
      startedAt: "2026-08-04T12:00:00.000Z",
    })
    const grant: MetaAuthoringCapability = {
      capability: META_DECLARATION_WRITE_CAPABILITY,
      method: META_DECLARATION_APPLY_METHOD,
      scopes: [ROOT],
      operationClass: "declaration",
      liveState: true,
      gitCommit: false,
    }
    let reads = 0
    const readMeta: DeclarationAuthoringMetaReader = async (address) => {
      reads += 1
      const source = await readFile(targetPath, "utf8")
      const declaration = await evaluateMetaSource(source)
      return {
        address,
        targetPath,
        source,
        revision: sourceRevision(source),
        name: declaration.name,
        ...(declaration.desc === undefined ? {} : {description: declaration.desc}),
        fields: declaration.fields as MetaFieldDSL[],
        states: declaration.superposition,
        ...(declaration.mass === undefined ? {} : {mass: declaration.mass}),
        ...(declaration.processes === undefined ? {} : {processes: declaration.processes}),
        ...(declaration.reactions === undefined ? {} : {reactions: declaration.reactions}),
        ...(declaration.bulk === undefined ? {} : {bulk: declaration.bulk}),
      }
    }
    let projections = 0
    const service = new DeclarationAuthoringService(
      history,
      {
        async acceptAuthoringParticle(input, cause) {
          const particle = sourceForceMessage(input, "dark").parts[0]
          const accepted = history.accept(particle, cause)
          await boundary.materialize({parts: [particle]})
          return {
            ok: true as const,
            delivered: ["boundary", "bulk"] as Array<"boundary" | "bulk">,
            particle,
            acceptance: {
              cutId: "declaration-authoring-test",
              sequence: accepted.sequence,
              id: accepted.id,
            },
          }
        },
      },
      () => [grant],
      readMeta,
      () => targetPath,
      {
        apply(particle) {
          projections += 1
          expect(particle).toMatchObject({part: "inflaton", op: "add", by: "dark"})
        },
      },
    )
    const request: MetaDeclarationRequest = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "add-mode",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      operation: "add",
      entity: "field",
      address: ROOT,
      field: {
        key: "mode",
        type: "enum",
        required: false,
        values: ["idle", "ready"],
        default: "idle",
      },
      revisions: [{address: ROOT, revision: await revision(targetPath)}],
    }

    const first = await service.apply(request, RPC_SOURCE)
    const repeated = await service.apply(request, RPC_SOURCE)
    const stateRequest: MetaDeclarationRequest = {
      contractVersion: META_AUTHORING_CONTRACT_VERSION,
      operationId: "add-ready",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      operation: "add",
      entity: "state",
      address: ROOT,
      state: {name: "ready", transitions: null},
      revisions: [{address: ROOT, revision: await revision(targetPath)}],
    }
    const stateResult = await service.apply(stateRequest, RPC_SOURCE)

    expect(first).toMatchObject({
      phase: "complete",
      boundary: "applied",
      acceptance: {cutId: "declaration-authoring-test", sequence: 1, id: "declaration-authoring-test:1"},
      source: {outcome: "published", files: [{address: ROOT, outcome: "published"}]},
      materialization: {outcome: "applied"},
    })
    expect(repeated).toMatchObject({
      phase: "complete",
      acceptance: first.acceptance,
      source: {outcome: "already_published"},
    })
    expect(stateResult).toMatchObject({
      phase: "complete",
      boundary: "applied",
      acceptance: {cutId: "declaration-authoring-test", sequence: 2},
      source: {outcome: "published"},
    })
    expect(reads).toBe(2)
    expect(projections).toBe(3)
    const entries = history.read()
    expect(entries).toHaveLength(2)
    expect(entries[0]?.authoring?.schema).toBe(META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1)
    expect(await readFile(targetPath, "utf8")).toContain(
      `mode: field.enum("idle", "ready").optional("idle"),`,
    )
    const field = (await boundary.projection.sql<Array<{id: number; localId: number; key: string}>>`
      SELECT id, local_id AS localId, key FROM field WHERE wimp = ${ROOT}
    `)[0]!
    expect(field).toEqual({id: expect.any(Number), localId: 1, key: "mode"})
    expect(await boundary.projection.sql<Array<{localId: number; itemValue: string}>>`
      SELECT local_id AS localId, item_value AS itemValue
        FROM field_enum_variant WHERE field = ${field.id} ORDER BY position
    `).toEqual([
      {localId: 1, itemValue: "idle"},
      {localId: 2, itemValue: "ready"},
    ])
    expect(await boundary.projection.sql<Array<{localId: number; name: string}>>`
      SELECT local_id AS localId, name FROM state WHERE wimp = ${ROOT}
    `).toEqual([{localId: 1, name: "ready"}])
  })
})
