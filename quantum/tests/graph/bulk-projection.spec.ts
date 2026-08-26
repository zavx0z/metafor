import {describe, expect, test} from "bun:test"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {
  BulkGraphValidationError,
  prepareBulkGraphCut,
  projectBulkGraph,
} from "../../bulk/graph/projection.ts"

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
        sources: [{meta: CHILD, states: ["visible"]}],
        src: "() => {}",
        read: ["mode"],
        write: ["title"],
        massRead: [],
        massWrite: [],
        states: ["ready"],
      }],
      matter: [{kind: "wimp", src: CHILD, fieldsBinding: {data: "title"}}],
    },
    [CHILD]: {
      name: "Child",
      fields: [],
      superposition: [{name: "visible", transitions: null}],
      mass: [],
      processes: [],
    },
  },
  runtime: {
    roots: [{
      ref: "atom:1",
      kind: "atom",
      declaration: "#/template/example~1root",
      meta: ROOT,
      state: "ready",
      values: {title, mode: "ready"},
      mass: [],
      children: [{
        ref: "atom:2",
        kind: "atom",
        declaration: "#/template/example~1root/matter/0",
        meta: CHILD,
        state: null,
        values: {},
        mass: [],
      }],
    }],
    reactions: [],
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
      ref: "atom:1",
      kind: "atom",
      declaration: "#/template/example~1child",
      meta: CHILD,
      state: null,
      values: {},
      mass: [],
    }],
    reactions: [],
  },
})

describe("Bulk request-local Graph adapter", () => {
  test("detaches one full document and derives the complete Bulk scene projection", () => {
    const input = document()

    const cut = prepareBulkGraphCut(input)
    input.runtime.roots.splice(0)

    expect(cut.document.runtime.roots).toHaveLength(1)
    expect(cut.projection.revision).toBe(0)
    expect(cut.projection.runtime.atoms.map(({wimp}) => wimp)).toEqual([ROOT, CHILD])
    expect(cut.projection.runtime.fields.map(({key}) => key)).toEqual(["title", "mode"])
    expect(cut.projection.runtime.transitions).toHaveLength(1)
    expect(cut.projection.runtime.conditions).toHaveLength(1)
    expect(cut.projection.runtime.processes[0]?.descriptor).toMatchObject({
      action: {readFields: [expect.any(Number)]},
      success: {writeFields: [expect.any(Number)]},
    })
    expect(cut.projection.runtime.reactions[0]).toMatchObject({
      read: [expect.any(Number)],
      write: [expect.any(Number)],
      states: [expect.any(Number)],
    })
    expect(cut.projection.runtime.matterParticles[0]).toMatchObject({
      particleKind: "wimp",
      targetSrc: CHILD,
      fieldsBinding: {data: "title"},
    })
  })

  test("prepares independent cuts with deterministic local identities", () => {
    const first = prepareBulkGraphCut(document("first")).projection
    const second = prepareBulkGraphCut(document("second")).projection

    expect(first.revision).toBe(0)
    expect(second.revision).toBe(0)
    expect(second.runtime.atoms.map(({id}) => id))
      .toEqual(first.runtime.atoms.map(({id}) => id))
    expect(second.runtime.atomValues.map(({field}) => field))
      .toEqual(first.runtime.atomValues.map(({field}) => field))
    expect(second.runtime.values.find(({kind}) => kind === "string")?.textValue)
      .toBe("second")
  })

  test("accepts the validated Dark-owned root without a caller-selected expectation", () => {
    const cut = prepareBulkGraphCut(childDocument())

    expect(cut.document.root).toBe(CHILD)
    expect(cut.projection.runtime.atoms.map(({wimp}) => wimp)).toEqual([CHILD])
  })

  test("rejects invalid data without creating a request-local cut", () => {
    const invalid = {...document("unsafe"), schema: "wrong"}

    expect(() => prepareBulkGraphCut(invalid)).toThrow(BulkGraphValidationError)
  })

  test("produces the same adapter result independently on server and browser", () => {
    expect(projectBulkGraph(document())).toEqual(
      projectBulkGraph(JSON.parse(JSON.stringify(document())) as Graph),
    )
  })
})
