import {describe, expect, test} from "bun:test"
import {validateGraph} from "@metafor/types/metafor/graph"
import {planStorybookShell} from "@zavx0z/storybook/workbench"
import {projectBulkGraph} from "../../bulk/graph/projection.ts"
import {GraphLabState} from "../../storybook/graph/state/lab-state.ts"
import {
  currentGraphFixture,
  reactionGraphFixture,
} from "../../storybook/graph/fixtures/graph.ts"
import {
  GRAPH_STORIES,
  graphStorybookPresentationRoute,
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
  test("keeps registered overviews presentational and rejects unknown paths", async () => {
    expect(GRAPH_STORIES.representative).toBe("document/current/complete")
    expect(graphStorybookPresentationRoute("")).toBe("document/current/complete")
    expect(graphStorybookPresentationRoute("validation")).toBe("validation/contract/closed")
    expect(graphStorybookPresentationRoute("reaction")).toBe("reaction/dependencies/complete")
    expect(graphStorybookPresentationRoute("node-tree")).toBe("node-tree/projection/live")
    expect(graphStorybookPresentationRoute("identity/same-meta")).toBe("identity/same-meta/reorder")
    expect(() => graphStorybookPresentationRoute("validation/unknown")).toThrow(
      "Неизвестный путь лаборатории Graph",
    )
    await expect(GRAPH_STORIES.load("validation/unknown")).rejects.toThrow(
      "Unknown storybook story route",
    )
  })

  test("loads real story modules and keeps the latest lazy selection", async () => {
    const state = await GraphLabState.create(graphStorybookPresentationRoute(""))
    const first = state.select("validation/contract/closed")
    const second = state.select("identity/same-meta/reorder")
    await Promise.all([first, second])
    expect(state.route).toBe("identity/same-meta/reorder")
    expect(state.story.apiName).toBe("MetaRuntimeAtomLocator")
    expect(state.module.source(state.args)).toContain("insertSameMetaSibling")
  })

  test("returning to the committed route cancels a pending lazy selection", async () => {
    const state = await GraphLabState.create("document/current/complete")
    const pending = state.select("validation/contract/closed")

    state.invalidateSelection()

    expect(await pending).toBeFalse()
    expect(state.route).toBe("document/current/complete")
    expect(state.story.apiName).toBe("Graph")
  })

  test("preserves the five desktop Workbench regions pixel-for-pixel", () => {
    expect(planStorybookShell(1920, 1080, {
      responsive: {compactBelow: null, compactPanels: []},
    })).toEqual({
      compact: false,
      stage: {x: 3, y: 3, w: 1914, h: 1074},
      catalog: {x: 3, y: 3, w: 210, h: 1074},
      section: {x: 214, y: 3, w: 160, h: 1074},
      preview: {x: 375, y: 3, w: 1101, h: 1049},
      dock: {x: 375, y: 1053, w: 1101, h: 24},
      info: {x: 1477, y: 3, w: 440, h: 1074},
    })
  })
})
