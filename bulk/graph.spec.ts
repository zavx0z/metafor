import {describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {
  BulkGraphStore,
  BulkGraphValidationError,
  projectBulkGraph,
} from "./graph.ts"

const ROOT = parseMetaAddress("example/root")!
const CHILD = parseMetaAddress("example/child")!

const document = (title = "current"): Graph => ({
  schema: GRAPH_SCHEMA,
  root: ROOT,
  template: {
    [ROOT]: {
      name: "Root",
      fields: [
        {key: "title", type: "string"},
        {key: "mode", type: "enum", required: true, default: "idle", values: ["idle", "ready"]},
      ],
      superposition: [
        {name: "idle", transitions: {ready: {mode: "ready"}}},
        {name: "ready", transitions: null},
      ],
      mass: [],
      processes: [{
        key: "ready",
        declaration: {
          type: "action",
          action: {src: "./ready.ts", read: ["title"]},
          success: {src: "() => {}", write: ["title"]},
        },
      }],
      reactions: [{
        key: "observe",
        label: "Observe",
        desc: null,
        cond: "() => true",
        src: "() => {}",
        read: ["mode"],
        write: ["title"],
        states: ["ready"],
      }],
      matter: [{kind: "wimp", src: CHILD, fieldsBinding: {data: "title"}}],
    },
    [CHILD]: {
      name: "Child",
      fields: [],
      superposition: [],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "ready",
      values: {title, mode: "ready"},
      children: [{
        kind: "atom",
        declaration: "#/template/example~1root/matter/0",
        meta: CHILD,
        state: null,
        values: {},
      }],
    }],
  },
})

const childDocument = (): Graph => ({
  schema: GRAPH_SCHEMA,
  root: CHILD,
  template: {
    [CHILD]: {
      name: "Child",
      fields: [],
      superposition: [],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      kind: "atom",
      declaration: "#/template/example~1child",
      meta: CHILD,
      state: null,
      values: {},
    }],
  },
})

describe("Bulk Graph Store and adapter", () => {
  test("retains one detached full document and derives the complete Bulk scene projection", () => {
    const store = new BulkGraphStore()
    const input = document()

    store.replace(input)
    input.runtime.roots.splice(0)
    const retained = store.read()
    const projected = store.projection()

    expect(retained.runtime.roots).toHaveLength(1)
    expect(projected.revision).toBe(1)
    expect(projected.runtime.atoms.map(({wimp}) => wimp)).toEqual([ROOT, CHILD])
    expect(projected.runtime.fields.map(({key}) => key)).toEqual(["title", "mode"])
    expect(projected.runtime.transitions).toHaveLength(1)
    expect(projected.runtime.conditions).toHaveLength(1)
    expect(projected.runtime.processes[0]?.descriptor).toMatchObject({
      action: {readFields: [expect.any(Number)]},
      success: {writeFields: [expect.any(Number)]},
    })
    expect(projected.runtime.reactions[0]).toMatchObject({
      read: [expect.any(Number)],
      write: [expect.any(Number)],
      states: [expect.any(Number)],
    })
    expect(projected.runtime.matterParticles[0]).toMatchObject({
      particleKind: "wimp",
      targetSrc: CHILD,
      fieldsBinding: {data: "title"},
    })
  })

  test("atomically replaces the same Store after an update and keeps deterministic local identities", () => {
    const store = new BulkGraphStore()
    store.replace(document("first"))
    const first = store.projection()
    store.replace(document("second"))
    const second = store.projection()

    expect(second.revision).toBe(2)
    expect(second.runtime.atoms.map(({id}) => id))
      .toEqual(first.runtime.atoms.map(({id}) => id))
    expect(second.runtime.atomValues.map(({field}) => field))
      .toEqual(first.runtime.atomValues.map(({field}) => field))
    expect(second.runtime.values.find(({kind}) => kind === "string")?.textValue)
      .toBe("second")
  })

  test("accepts the validated Dark-owned root without a caller-selected expectation", () => {
    const store = new BulkGraphStore()

    store.replace(childDocument())

    expect(store.read().root).toBe(CHILD)
    expect(store.projection().runtime.atoms.map(({wimp}) => wimp)).toEqual([CHILD])
  })

  test("rejects invalid data without replacing the prior cut", () => {
    const store = new BulkGraphStore()
    store.replace(document("safe"))
    const invalid = {...document("unsafe"), schema: "wrong"}

    expect(() => store.replace(invalid)).toThrow(BulkGraphValidationError)
    expect(store.read().runtime.roots[0]).toMatchObject({values: {title: "safe"}})
    expect(store.revision).toBe(1)
  })

  test("produces the same adapter result independently on server and browser", () => {
    expect(projectBulkGraph(document())).toEqual(
      projectBulkGraph(JSON.parse(JSON.stringify(document())) as Graph),
    )
  })
})
