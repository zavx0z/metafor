import {describe, expect, test} from "bun:test"
import {validateGraph} from "@metafor/types/metafor/graph"
import {createDocument} from "@zavx0z/dom"
import {projectBulkGraph} from "../../bulk/graph/projection.ts"
import {createGraphOverview} from "../../storybook/graph/overview.ts"
import {
  currentGraphFixture,
  reactionGraphFixture,
} from "../../storybook/graph/fixtures/graph.ts"
import {
  GRAPH_STORIES,
  graphOverviewInput,
} from "../../storybook/graph/stories.ts"
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
    expect(reactionGraphFixture()).toMatchObject({
      relation: {ref: "reaction:remember:1:2"},
      massContent: {included: false, read: "energy.mass.result.read"},
    })
    expect(currentGraphFixture("bulk")).toMatchObject({
      reactions: 1,
      reactionRelations: 1,
      mass: 1,
    })
  })
})

describe("Quantum Graph Storybook laboratory", () => {
  test("keeps registered overviews independent from detail leaves and rejects unknown paths", async () => {
    expect(GRAPH_STORIES.representative).toBe("document/current/complete")
    for (const route of GRAPH_STORIES.routeTree.overviews) {
      const overview = createGraphOverview(createDocument(), graphOverviewInput(route))
      expect(overview.element.getAttribute("data-route"), route).toBe(route)
      expect(overview.element.querySelector(".graph-json"), route).toBeNull()
      expect(overview.element.querySelector(".graph-node-tree"), route).toBeNull()
      overview.dispose()
    }
    expect(() => graphOverviewInput("validation/unknown")).toThrow(
      "Graph overview route is not registered",
    )
    await expect(GRAPH_STORIES.load("validation/unknown")).rejects.toThrow(
      "Unknown Storybook DOM route",
    )
  })

  test("loads exact DOM story factories once and mounts them in caller-owned realms", async () => {
    const first = GRAPH_STORIES.load("identity/same-meta/reorder")
    const second = GRAPH_STORIES.load("identity/same-meta/reorder")
    expect(first).toBe(second)
    const factory = await first
    const document = createDocument()
    const story = factory(document)
    expect(story.element.ownerDocument).toBe(document)
    expect(story.args).toEqual({"insert-sibling": true})
    expect(story.source.html).toContain('class="graph-json"')
    expect(story.source.css).toContain(".graph-json__result")
    expect(story.source.typescript).toContain("insertSameMetaSibling")
    story.dispose()
  })

  test("keeps all Graph route levels declared for exact server delivery", () => {
    expect(GRAPH_STORIES.routeTree.overviews).toEqual([
      "",
      "document",
      "document/current",
      "reaction",
      "reaction/dependencies",
      "validation",
      "validation/contract",
      "node-tree",
      "node-tree/projection",
      "identity",
      "identity/same-meta",
    ])
  })
})
