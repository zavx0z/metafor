import {afterEach, describe, expect, test} from "bun:test"
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  DARK_FORCE_HISTORY_CATALOG_SCHEMA,
  DARK_FORCE_HISTORY_SCHEMA,
  DARK_FORCE_PARTICLE_SCHEMA,
  DarkForceHistory,
} from "./history.ts"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  type MetaDeclarationAuthoringCauseV1,
  type MetaMatterAuthoringCauseV1,
} from "shared/protocol/metafor/authoring"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

const directories: string[] = []

const path = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-dark-force-history-"))
  directories.push(directory)
  return join(directory, "v1")
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true})
})

const clock = (...times: string[]): (() => Date) => {
  if (times.length === 0) throw new Error("Test clock requires at least one time")
  let index = 0
  return () => new Date(times[Math.min(index++, times.length - 1)]!)
}

const particle = (part: "gluon" | "inflaton", ts: number, by = "matrix") => ({
  part,
  op: "replace" as const,
  path: part,
  by,
  ts,
  value: {at: ts},
})

const digest = (value: string): `sha256:${string}` =>
  `sha256:${value.repeat(64)}`

const authoring = (
  requestDigest = digest("a"),
): MetaMatterAuthoringCauseV1 => ({
  schema: META_MATTER_AUTHORING_CAUSE_SCHEMA_V1,
  contractVersion: META_AUTHORING_CONTRACT_VERSION,
  rpcSource: "authoring-agent",
  operationId: "matter-add-1",
  requestDigest,
  sourceProjections: [{
    address: parseMetaAddress("zavx0z/lada")!,
    beforeRevision: digest("b"),
    afterRevision: digest("c"),
  }],
})

const declarationAuthoring = (): MetaDeclarationAuthoringCauseV1 => ({
  ...authoring(digest("d")),
  schema: META_DECLARATION_AUTHORING_CAUSE_SCHEMA_V1,
  operationId: "field-add-1",
})

describe("Dark Force complete Particle history", () => {
  test("requires an explicit portable cut identity before creating the first complete history", () => {
    expect(() => new DarkForceHistory(path())).toThrow("DARK_FORCE_HISTORY_CUT_ID is required")
    expect(() => new DarkForceHistory(path(), {cutId: "not:portable"})).toThrow("cutId must use only")
  })

  test("keeps cut metadata outside Particle-only segments and exposes stable acceptance IDs", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "mf102-test-cut",
      startedAt: "2026-07-26T12:00:00.000Z",
    }, {
      now: clock("2026-07-26T12:00:01.000Z", "2026-07-26T12:00:02.000Z"),
    })

    history.accept(particle("gluon", 10))
    history.accept(particle("inflaton", 9, "dark"))

    expect(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))).toEqual({
      schema: DARK_FORCE_HISTORY_SCHEMA,
      cutId: "mf102-test-cut",
      startedAt: "2026-07-26T12:00:00.000Z",
      retroactiveComplete: false,
      legacyHistory: "removed-after-backup",
      segmentCapacity: 4096,
    })
    const files = readdirSync(join(directory, "segments"))
    expect(files).toEqual(["00000000000000000001.ndjson"])
    const lines = readFileSync(join(directory, "segments", files[0]!), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(lines).toEqual([
      {
        schema: DARK_FORCE_PARTICLE_SCHEMA,
        id: "mf102-test-cut:1",
        sequence: 1,
        acceptedAt: "2026-07-26T12:00:01.000Z",
        particle: particle("gluon", 10),
      },
      {
        schema: DARK_FORCE_PARTICLE_SCHEMA,
        id: "mf102-test-cut:2",
        sequence: 2,
        acceptedAt: "2026-07-26T12:00:02.000Z",
        particle: particle("inflaton", 9, "dark"),
      },
    ])
    expect(lines.every((entry) => entry.kind === undefined && entry.particle)).toBe(true)
    expect(history.status()).toEqual({
      path: directory,
      cutId: "mf102-test-cut",
      startedAt: "2026-07-26T12:00:00.000Z",
      sequence: 2,
      segments: 1,
      retroactiveComplete: false,
    })
  })

  test("rotates bounded segments and navigates by ID, sequence, both times and Particle fields", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "navigation",
      startedAt: "2026-07-26T12:00:00.000Z",
      segmentCapacity: 2,
    }, {
      now: clock(
        "2026-07-26T12:00:03.000Z",
        "2026-07-26T12:00:01.000Z",
        "2026-07-26T12:00:02.000Z",
      ),
    })

    history.accept({...particle("gluon", 30), from: "execution-1"})
    history.accept(particle("inflaton", 10, "dark"))
    history.accept(particle("gluon", 20, "boundary"))

    expect(readdirSync(join(directory, "segments")).toSorted()).toEqual([
      "00000000000000000001.ndjson",
      "00000000000000000003.ndjson",
    ])
    expect(history.read({id: "navigation:2"}).map((entry) => entry.sequence)).toEqual([2])
    expect(history.read({fromSequence: 2, toSequence: 3}).map((entry) => entry.sequence)).toEqual([2, 3])
    expect(history.read({
      fromAcceptedAt: "2026-07-26T12:00:02.000Z",
      toAcceptedAt: "2026-07-26T12:00:03.000Z",
    }).map((entry) => entry.sequence)).toEqual([1, 3])
    expect(history.read({fromParticleTs: 15, toParticleTs: 25}).map((entry) => entry.sequence)).toEqual([3])
    expect(history.read({part: "gluon", by: "matrix", path: "gluon"}).map((entry) => entry.sequence)).toEqual([1])
    expect(history.read({from: "execution-1"}).map((entry) => entry.sequence)).toEqual([1])
    expect(history.read({fromSequence: 1, limit: 2}).map((entry) => entry.sequence)).toEqual([1, 2])

    const catalog = JSON.parse(readFileSync(join(directory, "catalog.json"), "utf8"))
    expect(catalog.schema).toBe(DARK_FORCE_HISTORY_CATALOG_SCHEMA)
    expect(catalog.segments.map((segment: {firstSequence: number; lastSequence: number}) =>
      [segment.firstSequence, segment.lastSequence])).toEqual([[1, 2], [3, 3]])
  })

  test("stores immutable RPC causation in the accepted Particle row and reopens its lookup", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "authoring",
      startedAt: "2026-08-04T12:00:00.000Z",
    }, {
      now: clock("2026-08-04T12:00:01.000Z"),
    })
    const cause = authoring()

    const accepted = history.accept(particle("inflaton", 1, "dark"), cause)

    expect(accepted).toMatchObject({
      id: "authoring:1",
      sequence: 1,
      authoring: cause,
    })
    expect(
      readFileSync(join(directory, "segments", "00000000000000000001.ndjson"), "utf8")
        .trim()
        .split("\n"),
    ).toHaveLength(1)
    const reopened = new DarkForceHistory(directory)
    expect(reopened.findAuthoring("authoring-agent", "matter-add-1")).toEqual(accepted)
    expect(reopened.findAuthoring("authoring-agent", "missing")).toBeNull()
  })

  test("reopens declaration causation from the same accepted Particle history", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "declaration-authoring",
      startedAt: "2026-08-04T12:00:00.000Z",
    })
    const cause = declarationAuthoring()
    const accepted = history.accept(particle("inflaton", 1, "dark"), cause)

    const reopened = new DarkForceHistory(directory)
    expect(reopened.findAuthoring("authoring-agent", "field-add-1")).toEqual(accepted)
    expect(reopened.read()).toEqual([accepted])
  })

  test("rejects a repeated authoring key without appending the same or a conflicting request", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "authoring-conflict",
      startedAt: "2026-08-04T12:00:00.000Z",
    })
    history.accept(particle("inflaton", 1, "dark"), authoring())

    expect(() => history.accept(
      particle("inflaton", 2, "dark"),
      authoring(),
    )).toThrow("already has an accepted Particle")
    expect(() => history.accept(
      particle("inflaton", 3, "dark"),
      authoring(digest("d")),
    )).toThrow("different request digest")
    expect(history.status().sequence).toBe(1)
    expect(history.read()).toHaveLength(1)
  })

  test("rebuilds a missing or stale derived catalog without changing Particle truth", () => {
    const directory = path()
    new DarkForceHistory(directory, {
      cutId: "catalog",
      startedAt: "2026-07-26T12:00:00.000Z",
      segmentCapacity: 2,
    }, {
      now: clock("2026-07-26T12:00:01.000Z", "2026-07-26T12:00:02.000Z"),
    }).accept(particle("gluon", 1))
    new DarkForceHistory(directory).accept(particle("inflaton", 2))

    writeFileSync(join(directory, "catalog.json"), "{\"stale\":true}\n")
    const reopened = new DarkForceHistory(directory)
    expect(reopened.read().map((entry) => entry.id)).toEqual(["catalog:1", "catalog:2"])
    expect(JSON.parse(readFileSync(join(directory, "catalog.json"), "utf8"))).toMatchObject({
      schema: DARK_FORCE_HISTORY_CATALOG_SCHEMA,
      cutId: "catalog",
      segments: [{firstSequence: 1, lastSequence: 2, count: 2}],
    })

    rmSync(join(directory, "catalog.json"))
    expect(new DarkForceHistory(directory).read().map((entry) => entry.sequence)).toEqual([1, 2])
    expect(existsSync(join(directory, "catalog.json"))).toBe(true)
  })

  test("resumes exact sequence and rejects cut mismatch, gaps and truncated tails without repair", () => {
    const directory = path()
    new DarkForceHistory(directory, {
      cutId: "stable-cut",
      startedAt: "2026-07-26T12:00:00.000Z",
    }).accept(particle("gluon", 1))

    expect(new DarkForceHistory(directory).status().sequence).toBe(1)
    expect(() => new DarkForceHistory(directory, {cutId: "other-cut"})).toThrow("cutId mismatch")

    const segment = join(directory, "segments", "00000000000000000001.ndjson")
    appendFileSync(segment, "{\"schema\":")
    expect(() => new DarkForceHistory(directory)).toThrow("truncated tail")
  })

  test("rejects non-Particle and non-JSON payloads before writing a segment line", () => {
    const directory = path()
    const history = new DarkForceHistory(directory, {
      cutId: "closed",
      startedAt: "2026-07-26T12:00:00.000Z",
    })
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    let getterCalls = 0
    const accessor = particle("gluon", 1) as Record<string, unknown>
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get() {
        getterCalls++
        return {not: "read"}
      },
    })

    expect(() => history.accept({...particle("gluon", 1), value: cyclic})).toThrow("Particle is invalid")
    expect(() => history.accept({...particle("gluon", 1), extra: "log"} as never)).toThrow("Particle is invalid")
    expect(() => history.accept(accessor as never)).toThrow("Particle is invalid")
    expect(getterCalls).toBe(0)
    expect(history.status().sequence).toBe(0)
    expect(readdirSync(join(directory, "segments"))).toEqual([])
  })
})
