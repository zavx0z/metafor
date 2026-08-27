import {describe, expect, test} from "bun:test"
import {
  createDocument,
  Event,
  type CustomEvent,
  type HTMLInputElement,
  type HTMLSelectElement,
} from "@zavx0z/dom"
import {STORYBOOK_DOM_WORKBENCH_EVENTS} from "@zavx0z/storybook/workbench"
import {createGraphOverview} from "./overview.ts"
import {
  GRAPH_STORIES,
  graphOverviewInput,
  type GraphStoryRoute,
} from "./stories.ts"

describe("Quantum Graph DOM stories", () => {
  test("keeps the five canonical leaves in the shared DOM catalog", () => {
    expect(GRAPH_STORIES.routeTree.leaves).toEqual([
      "document/current/complete",
      "reaction/dependencies/complete",
      "validation/contract/closed",
      "node-tree/projection/live",
      "identity/same-meta/reorder",
    ])
    expect(GRAPH_STORIES.index.map(({apiName}) => apiName)).toEqual([
      "Graph",
      "RuntimeReactionRelation",
      "validateGraph",
      "createGraphNodeTree",
      "MetaRuntimeAtomLocator",
    ])
  })

  test("loads every leaf lazily into the supplied semantic Document", async () => {
    for (const route of GRAPH_STORIES.routeTree.leaves as readonly GraphStoryRoute[]) {
      const document = createDocument()
      const factory = await GRAPH_STORIES.load(route)
      const story = factory(document)
      try {
        expect(story.element.ownerDocument, route).toBe(document)
        expect(story.element.parentNode, route).toBeNull()
        expect(story.source.html.length, route).toBeGreaterThan(40)
        expect(story.source.css.length, route).toBeGreaterThan(40)
        expect(story.source.typescript.length, route).toBeGreaterThan(40)
      } finally {
        story.dispose()
      }
    }
  })

  test("updates native select and checkbox controls without replacing story roots", async () => {
    const currentFactory = await GRAPH_STORIES.load("document/current/complete")
    const current = currentFactory(createDocument())
    const currentRoot = current.element
    const select = current.element.querySelector('select[data-control-key="view"]') as HTMLSelectElement
    select.value = "bulk"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    expect(current.element).toBe(currentRoot)
    expect(current.args).toEqual({view: "bulk"})
    expect(current.source.typescript).toContain("projectBulkGraph(graph)")
    current.dispose()

    const validationFactory = await GRAPH_STORIES.load("validation/contract/closed")
    const validation = validationFactory(createDocument())
    const validationRoot = validation.element
    const checkbox = validation.element.querySelector(
      'input[data-control-key="include-revision"]',
    ) as HTMLInputElement
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change", {bubbles: true}))
    expect(validation.element).toBe(validationRoot)
    expect(validation.args).toEqual({"include-revision": false})
    expect(validation.source.typescript).toContain("const candidate = graph")
    expect(validation.source.typescript).not.toContain("revision: 17")
    validation.dispose()
  })

  test("renders every overview as its own navigation presentation", () => {
    for (const route of GRAPH_STORIES.routeTree.overviews) {
      const story = createGraphOverview(createDocument(), graphOverviewInput(route))
      try {
        expect(story.element.className, route).toBe("graph-overview")
        expect(story.element.getAttribute("data-route"), route).toBe(route)
        expect(story.element.querySelector(".graph-json"), route).toBeNull()
        expect(story.element.querySelector(".ui-code-editor"), route).toBeNull()
        expect(story.element.querySelector(".graph-node-tree"), route).toBeNull()
        expect(story.element.querySelectorAll("button").length, route).toBeGreaterThan(0)
      } finally {
        story.dispose()
      }
    }
  })

  test("overview buttons emit the native Workbench CustomEvent with an exact route", () => {
    const story = createGraphOverview(createDocument(), graphOverviewInput("document/current"))
    let route = ""
    story.element.addEventListener(STORYBOOK_DOM_WORKBENCH_EVENTS.navigate, (event) => {
      route = (event as CustomEvent<{route: string}>).detail.route
    })
    story.element.querySelector("button")!.dispatchEvent(new Event("click", {bubbles: true}))
    expect(route).toBe("document/current/complete")
    story.dispose()
  })
})
