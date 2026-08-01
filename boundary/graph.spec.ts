import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  validateGraph,
  type MetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {Particle} from "shared/protocol/force/particle"
import {
  readBoundaryGraphProjection,
} from "./graph.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = parseMetaAddress("example/root")!
const CHILD = parseMetaAddress("example/child")!
const FIRST = parseMetaAddress("example/first")!
const SECOND = parseMetaAddress("example/second")!

type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

const template = (): Graph["template"] => ({
  [ROOT]: {
    name: "Root",
    fields: [
      {key: "items", type: "array", required: true, default: [1, 2]},
      {key: "mode", type: "enum", required: true, default: "active", values: ["active", "paused"]},
      {key: "count", type: "number", required: true, default: 7},
    ],
    superposition: [{name: "ready", transitions: null}],
    mass: [],
    processes: [],
    matter: [{
      kind: "macho",
      collectionBinding: {data: "items"},
      children: [{
        edgeSlot: "child",
        particle: {kind: "wimp", src: CHILD},
      }],
    }],
  },
  [CHILD]: {
    name: "Child",
    fields: [{key: "note", type: "string"}],
    superposition: [],
    mass: [],
    processes: [],
  },
})

const objectKeys = (value: unknown): string[] => {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(objectKeys)
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => [key, ...objectKeys(item)])
}

const deferred = (): {promise: Promise<void>; resolve(): void} => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return {promise, resolve}
}

describe("Boundary Graph current projection", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: ParticleInput): Promise<void> => {
    await boundary.materialize({parts: [{ts: 1, ...particle}] as [Particle]})
  }

  const declaration = async (
    path: string,
    wimp: MetaAddress,
    id: number,
    value: Record<string, unknown>,
  ): Promise<void> => {
    await apply({
      part: "inflaton",
      op: "add",
      path,
      value: {wimp, id, ...value},
    })
  }

  test("projects nested current occurrences with public names, values and exact Matter pointers", async () => {
    await apply({
      part: "inflaton",
      op: "add",
      path: "wimp",
      value: {src: ROOT, name: "Root"},
    })
    await declaration("field", ROOT, 1, {
      key: "items",
      type: "array",
      required: true,
      default: [1, 2],
      position: 0,
    })
    await declaration("field", ROOT, 2, {
      key: "mode",
      type: "enum",
      required: true,
      default: "active",
      position: 1,
    })
    await declaration("variant", ROOT, 1, {field: 2, position: 0, value: "active"})
    await declaration("variant", ROOT, 2, {field: 2, position: 1, value: "paused"})
    await declaration("field", ROOT, 3, {
      key: "count",
      type: "number",
      required: true,
      default: 7,
      position: 2,
    })
    await declaration("state", ROOT, 1, {name: "ready", position: 0})
    const rootAtom = (await boundary.initialState()).atoms.find((atom) => atom.wimp === ROOT)
    if (!rootAtom) throw new Error("Root Atom was not materialized")
    await apply({part: "photon", op: "replace", path: rootAtom.id, value: "ready"})
    await declaration("matter", ROOT, 1, {
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "macho",
      collectionBinding: {data: "items"},
    })
    await declaration("matter", ROOT, 2, {
      parent: 1,
      edgeSlot: "child",
      position: 0,
      kind: "wimp",
      src: CHILD,
    })
    await apply({
      part: "inflaton",
      op: "add",
      path: "wimp",
      value: {src: CHILD, name: "Child"},
    })
    await declaration("field", CHILD, 1, {
      key: "note",
      type: "string",
      required: false,
      position: 0,
    })

    const projection = await readBoundaryGraphProjection(boundary, {root: ROOT})

    expect(projection).toEqual({
      root: ROOT,
      runtime: {
        roots: [{
          kind: "atom",
          declaration: "#/template/example~1root",
          meta: ROOT,
          state: "ready",
          values: {items: [1, 2], mode: "active", count: 7},
          children: [{
            kind: "topology",
            declaration: "#/template/example~1root/matter/0",
            topology: "macho",
            children: [
              {
                kind: "atom",
                declaration: "#/template/example~1root/matter/0/children/0/particle",
                meta: CHILD,
                state: null,
                values: {note: null},
              },
              {
                kind: "atom",
                declaration: "#/template/example~1root/matter/0/children/0/particle",
                meta: CHILD,
                state: null,
                values: {note: null},
              },
            ],
          }],
        }],
      },
    })

    const document: Graph = {
      schema: GRAPH_SCHEMA,
      root: projection.root,
      template: template(),
      runtime: projection.runtime,
    }
    expect(validateGraph(document)).toEqual({ok: true, value: document})
    expect(objectKeys(projection)).not.toContainAnyValues([
      "id",
      "atomId",
      "fieldId",
      "valueId",
      "parentAtom",
      "parentTopology",
      "position",
      "ordinal",
      "scopeAtom",
      "ownerAtom",
    ])
  })

  test("selects only the requested materialized root", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Root"}})
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: CHILD, name: "Child"}})

    const projection = await readBoundaryGraphProjection(boundary, {root: CHILD})

    expect(projection.runtime.roots).toEqual([{
      kind: "atom",
      declaration: "#/template/example~1child",
      meta: CHILD,
      state: null,
      values: {},
    }])
  })

  test("preserves current declaration sibling order instead of runtime creation order", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Root"}})
    await declaration("matter", ROOT, 1, {
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: FIRST,
    })
    await declaration("matter", ROOT, 2, {
      parent: null,
      edgeSlot: "root",
      position: 1,
      kind: "wimp",
      src: SECOND,
    })

    // The later declaration materializes first; stored sibling positions remain authoritative.
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: SECOND, name: "Second"}})
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: FIRST, name: "First"}})

    const projection = await readBoundaryGraphProjection(boundary, {root: ROOT})

    expect(projection.runtime.roots[0]?.children).toEqual([
      {
        kind: "atom",
        declaration: "#/template/example~1root/matter/0",
        meta: FIRST,
        state: null,
        values: {},
      },
      {
        kind: "atom",
        declaration: "#/template/example~1root/matter/1",
        meta: SECOND,
        state: null,
        values: {},
      },
    ])
  })

  test("reads one fenced committed cut while prior and subsequent materializations are paused", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Root"}})
    await declaration("matter", ROOT, 1, {
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: CHILD,
    })
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: CHILD, name: "Child"}})

    const priorApplied = deferred()
    const releasePrior = deferred()
    const snapshotReading = deferred()
    const releaseSnapshotRead = deferred()
    const snapshotCopied = deferred()
    const releaseProjection = deferred()
    const originalApply = boundary.projection.apply.bind(boundary.projection)
    const originalReplay = boundary.projection.replay.bind(boundary.projection)
    const originalSnapshot = boundary.graphSnapshot.bind(boundary)
    let pauseNextApply = true
    let pauseNextReplay = true
    let prior: Promise<unknown> | undefined
    let reading: Promise<unknown> | undefined
    let subsequent: Promise<unknown> | undefined

    boundary.projection.apply = async (message) => {
      const result = await originalApply(message)
      if (pauseNextApply) {
        pauseNextApply = false
        priorApplied.resolve()
        await releasePrior.promise
      }
      return result
    }
    boundary.projection.replay = async () => {
      const result = await originalReplay()
      if (pauseNextReplay) {
        pauseNextReplay = false
        snapshotReading.resolve()
        await releaseSnapshotRead.promise
      }
      return result
    }
    boundary.graphSnapshot = async () => {
      const snapshot = await originalSnapshot()
      snapshotCopied.resolve()
      await releaseProjection.promise
      return snapshot
    }

    try {
      prior = boundary.materialize({parts: [{
        part: "inflaton",
        op: "add",
        path: "field",
        value: {wimp: ROOT, id: 1, key: "title", type: "string"},
        ts: 2,
      }]})
      await priorApplied.promise

      let readSettled = false
      reading = readBoundaryGraphProjection(boundary, {root: ROOT})
        .finally(() => {
          readSettled = true
        })
      let subsequentSettled = false
      subsequent = boundary.materialize({parts: [{
        part: "inflaton",
        op: "remove",
        path: "matter",
        value: {wimp: ROOT, id: 1},
        ts: 3,
      }]}).finally(() => {
        subsequentSettled = true
      })

      releasePrior.resolve()
      await snapshotReading.promise
      expect(readSettled).toBe(false)
      expect(subsequentSettled).toBe(false)

      releaseSnapshotRead.resolve()
      await snapshotCopied.promise
      await subsequent
      expect(subsequentSettled).toBe(true)
      expect(readSettled).toBe(false)

      releaseProjection.resolve()
      const projection = await reading
      expect(projection).toMatchObject({
        runtime: {
          roots: [{
            values: {title: null},
            children: [{
              kind: "atom",
              declaration: "#/template/example~1root/matter/0",
              meta: CHILD,
            }],
          }],
        },
      })

      const afterRemoval = await readBoundaryGraphProjection(boundary, {root: ROOT})
      expect(afterRemoval.runtime.roots[0]).not.toHaveProperty("children")
      await prior
    } finally {
      releasePrior.resolve()
      releaseSnapshotRead.resolve()
      releaseProjection.resolve()
      await Promise.allSettled([prior, reading, subsequent].filter((item): item is Promise<unknown> => item !== undefined))
      boundary.projection.apply = originalApply
      boundary.projection.replay = originalReplay
      boundary.graphSnapshot = originalSnapshot
    }
  })

  test("rejects non-canonical or broadened read params before reading a projection", async () => {
    await expect(readBoundaryGraphProjection(boundary, {root: "example/root/extra"}))
      .rejects.toThrow("canonical two-segment")
    await expect(readBoundaryGraphProjection(boundary, {root: ROOT, diagnostic: true}))
      .rejects.toThrow("must contain only root")
  })
})
