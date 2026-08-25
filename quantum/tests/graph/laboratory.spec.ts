import {describe, expect, test} from "bun:test"
import {validateGraph} from "@metafor/types/metafor/graph"
import {planStorybookShell} from "@zavx0z/storybook/workbench"
import {projectBulkGraph} from "../../bulk/graph/projection.ts"
import {GraphLabState} from "../../storybook/graph/state/lab-state.ts"
import {
  GRAPH_STORIES,
  graphStorybookPresentationRoute,
} from "../../storybook/graph/stories.ts"
import {
  createGraphFixture,
  insertSameMetaSibling,
  runtimeFieldAt,
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
  })
})

describe("Quantum Graph Storybook laboratory", () => {
  test("keeps registered overviews presentational and rejects unknown paths", async () => {
    expect(GRAPH_STORIES.representative).toBe("document/current/complete")
    expect(graphStorybookPresentationRoute("")).toBe("document/current/complete")
    expect(graphStorybookPresentationRoute("validation")).toBe("validation/contract/closed")
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
