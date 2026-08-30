import {describe, expect, test} from "bun:test"
import {validateGraph} from "@metafor/types/metafor/graph"
import {createDocument} from "@zavx0z/dom"
import {projectBulkGraph} from "../../bulk/graph/projection.ts"
import {
  currentGraphFixture,
  reactionGraphFixture,
} from "../../../types/.storybook/fixtures/graph.ts"
import {createIdentityGraphStory} from "../../../types/.storybook/stories/identity.ts"
import type {GraphDomStoryFactory} from "../../../types/.storybook/stories/dom-story.tsx"
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

describe("Quantum Graph external laboratory", () => {
  test("loads exact owner factories into caller-owned realms", async () => {
    const catalog = await graphCatalog()
    const factory = await graphFactory(catalog, "graph/identity/same-meta/reorder")
    expect(factory).toBe(createIdentityGraphStory)
    const document = createDocument()
    const story = factory(document)
    expect(story.element.ownerDocument).toBe(document)
    expect(story.args).toEqual({"insert-sibling": true})
    expect(story.source.html).toContain('data-story="quantum-graph-identity"')
    expect(story.componentRoot.readStyleSheets().styleSheets.length).toBeGreaterThan(0)
    expect(story.source.typescript).toContain("insertSameMetaSibling")
    story.dispose()
  })

  test("fails closed for a route without an exact owner factory", async () => {
    await expect(graphFactory(await graphCatalog(), "graph/validation/unknown"))
      .rejects.toThrow("Unknown Graph story route")
  })

  test("keeps all Graph overview routes or their explicit package-root remap", async () => {
    const catalog = await graphCatalog()
    expect([
      "graph",
      ...catalog.categories.flatMap((category) => [
        category.route,
        ...category.subjects.map((subject) => subject.route),
      ]),
    ]).toEqual([
      "graph",
      "graph/document",
      "graph/document/current",
      "graph/reaction",
      "graph/reaction/dependencies",
      "graph/validation",
      "graph/validation/contract",
      "graph/node-tree",
      "graph/node-tree/projection",
      "graph/identity",
      "graph/identity/same-meta",
    ])
  })
})

type GraphCatalog = Readonly<{
  categories: readonly Readonly<{
    route: string
    subjects: readonly Readonly<{
      route: string
      variants: readonly Readonly<{
        route: string
        module: Readonly<{path: string; export: string}>
      }>[]
    }>[]
  }>[]
}>

const graphCatalogUrl = new URL("../../../types/.storybook/catalog.json", import.meta.url)

async function graphCatalog(): Promise<GraphCatalog> {
  return await Bun.file(graphCatalogUrl).json() as GraphCatalog
}

async function graphFactory(catalog: GraphCatalog, route: string): Promise<GraphDomStoryFactory> {
  const variant = catalog.categories.flatMap(({subjects}) =>
    subjects.flatMap(({variants}) => variants)).find((candidate) => candidate.route === route)
  if (variant === undefined) throw new Error(`Unknown Graph story route: ${route}`)
  const loaded = await import(new URL(variant.module.path, graphCatalogUrl).href)
  const factory = loaded[variant.module.export]
  if (typeof factory !== "function") throw new Error(`Missing Graph story export: ${route}`)
  return factory as GraphDomStoryFactory
}
