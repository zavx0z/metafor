import {describe, expect, test} from "bun:test"
import {validateGraph} from "@metafor/types/metafor/graph"
import {projectBulkGraph} from "../../bulk/graph/projection.ts"
import {
  GRAPH_FIXTURE_CHILD,
  createGraphFixture,
  insertSameMetaSibling,
  runtimeFieldAt,
  runtimeRefAt,
} from "./fixture.ts"

describe("Quantum Graph laboratory fixtures", () => {
  test("remain valid across the current domain projections", () => {
    const graph = createGraphFixture()
    expect(validateGraph(graph).ok).toBe(true)
    expect(projectBulkGraph(graph).runtime.atoms).toHaveLength(3)
  })

  test("make positional same-Meta retargeting observable without declaring a new law", () => {
    const pointer = "/runtime/roots/0/children/1"
    const before = createGraphFixture()
    const after = insertSameMetaSibling(before)
    expect(validateGraph(after).ok).toBe(true)
    expect(runtimeFieldAt(before, pointer, "name")).toBe("второй")
    expect(runtimeFieldAt(after, pointer, "name")).toBe("первый")
    expect(runtimeRefAt(before, pointer)).toBe("atom:3")
    expect(runtimeRefAt(after, pointer)).toBe("atom:2")
    expect(after.runtime.reactions[0]?.source.atom).toBe("atom:2")
  })

  test("keeps complete Reaction dependencies visible while Mass content stays lazy", () => {
    const graph = createGraphFixture()
    const root = graph.runtime.roots[0]
    expect(graph.template[graph.root]?.reactions?.[0]).toMatchObject({
      sources: [{meta: GRAPH_FIXTURE_CHILD, states: ["present"]}],
      read: ["count"],
      write: ["count"],
      massRead: ["history"],
      massWrite: ["history"],
    })
    expect(graph.runtime.reactions[0]).toMatchObject({
      source: {atom: "atom:2", states: ["present"]},
      target: {atom: "atom:1", states: ["idle"]},
      active: true,
    })
    expect(root?.kind === "atom" ? root.mass : []).toEqual([expect.objectContaining({
      ref: "mass:graph-history",
      key: "history",
      content: "lazy",
    })])
    expect(JSON.stringify(graph)).not.toContain("MassHandle")
  })
})
