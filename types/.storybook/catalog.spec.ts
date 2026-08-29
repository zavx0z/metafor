import {describe, expect, test} from "bun:test"
import {
  createDocument,
  Event,
  type Document,
  type HTMLInputElement,
  type HTMLSelectElement,
} from "@zavx0z/dom"
import {
  createGraphOverview,
  type GraphOverviewInput,
} from "./stories/overview.ts"
import type {GraphDomStory, GraphDomStoryFactory} from "./stories/dom-story.tsx"
import {graphDomStoryCss} from "./stories/source.ts"

type Catalog = Readonly<{
  categories: readonly Readonly<{
    route: string
    label: string
    subjects: readonly Readonly<{
      route: string
      label: string
      apiName: string
      variants: readonly Readonly<{
        route: string
        label: string
        module: Readonly<{path: string; export: string}>
        resources: Readonly<{fixture: string; references: readonly string[]}>
      }>[]
    }>[]
  }>[]
}>

const catalogUrl = new URL("./catalog.json", import.meta.url)

describe("MetaFor Graph external stories", () => {
  test("keeps the five canonical leaves and exact public API owners", async () => {
    const catalog = await readCatalog()
    expect(leafRoutes(catalog)).toEqual([
      "graph/document/current/complete",
      "graph/reaction/dependencies/complete",
      "graph/validation/contract/closed",
      "graph/node-tree/projection/live",
      "graph/identity/same-meta/reorder",
    ])
    expect(catalog.categories.flatMap(({subjects}) => subjects.map(({apiName}) => apiName))).toEqual([
      "Graph",
      "RuntimeReactionRelation",
      "validateGraph",
      "createGraphNodeTree",
      "MetaRuntimeAtomLocator",
    ])
    for (const category of catalog.categories) {
      for (const subject of category.subjects) {
        for (const variant of subject.variants) {
          expect(variant.resources).toEqual({
            fixture: "./fixtures/graph.ts",
            references: ["./stories/source.ts"],
          })
        }
      }
    }
  })

  test("loads every leaf independently into the supplied semantic Document", async () => {
    const catalog = await readCatalog()
    for (const route of leafRoutes(catalog)) {
      const document = createDocument()
      const story = await loadStory(catalog, document, route)
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

  test("updates production select and checkbox controls without replacing roots", async () => {
    const catalog = await readCatalog()
    const current = await loadStory(catalog, createDocument(), "graph/document/current/complete")
    const currentRoot = current.element
    const select = current.element.querySelector('[data-control-key="view"]') as HTMLSelectElement
    select.value = "bulk"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    expect(current.element).toBe(currentRoot)
    expect(current.args).toEqual({view: "bulk"})
    expect(current.source.typescript).toContain("projectBulkGraph(graph)")
    current.dispose()

    const validation = await loadStory(catalog, createDocument(), "graph/validation/contract/closed")
    const validationRoot = validation.element
    const checkbox = validation.element.querySelector(
      '[data-control-key="include-revision"]',
    ) as HTMLInputElement
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change", {bubbles: true}))
    expect(validation.element).toBe(validationRoot)
    expect(validation.args).toEqual({"include-revision": false})
    expect(validation.source.typescript).toContain("const candidate = graph")
    expect(validation.source.typescript).not.toContain("revision: 17")
    validation.dispose()
  })

  test("preserves bounded aggregate overview resources without navigation links", async () => {
    const catalog = await readCatalog()
    for (const input of graphOverviewInputs(catalog)) {
      const story = createGraphOverview(
        createDocument(),
        input,
        (document, route) => loadStory(catalog, document, route),
      )
      try {
        await story.ready
        expect(story.element.className, input.route).toContain("graph-overview")
        expect(story.element.getAttribute("data-route"), input.route).toBe(input.route)
        expect(story.element.querySelectorAll(".graph-overview__item"), input.route)
          .toHaveLength(input.items.length)
        expect(story.children, input.route).toHaveLength(input.items.length)
        expect(
          story.element.querySelectorAll(".graph-json").length
            + story.element.querySelectorAll(".graph-node-tree").length,
          input.route,
        ).toBe(input.items.length)
        expect(story.element.querySelector("a"), input.route).toBeNull()
        expect(story.source.typescript.length, input.route).toBeGreaterThan(40)
      } finally {
        story.dispose()
      }
    }
  })

  test("keeps WIP production styles in the owner runtime without a legacy shell", async () => {
    const runtime = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()
    const source = await Bun.file(new URL("./stories/source.ts", import.meta.url)).text()

    expect(runtime).toContain('import {codeEditorCss} from "@ui/components/code-editor"')
    expect(runtime).toContain("update: show")
    expect(runtime).toContain("context.mount(next.element)")
    expect(runtime).toContain("current.dispose()")
    expect(runtime).not.toContain("@zavx0z/storybook")
    expect(runtime).not.toContain("StorybookRouteTreeRouter")
    expect(runtime).not.toContain("createStorybookDomWorkbench")
    expect(runtime).not.toContain("createDocumentCanvasRuntime")
    expect(source).not.toContain('import {codeEditorCss} from "@ui/components/code-editor"')
    expect(graphDomStoryCss).not.toContain("border-left: 3px solid")
    expect(graphDomStoryCss).toContain("border-color:")
    expect(graphDomStoryCss).toContain("border-radius: 0")
  })
})

async function readCatalog(): Promise<Catalog> {
  return await Bun.file(catalogUrl).json() as Catalog
}

function leafRoutes(catalog: Catalog): string[] {
  return catalog.categories.flatMap(({subjects}) =>
    subjects.flatMap(({variants}) => variants.map(({route}) => route)))
}

async function loadStory(
  catalog: Catalog,
  document: Document,
  route: string,
): Promise<GraphDomStory> {
  const variant = catalog.categories.flatMap(({subjects}) =>
    subjects.flatMap(({variants}) => variants)).find((candidate) => candidate.route === route)
  if (variant === undefined) throw new Error(`Unknown Graph story route: ${route}`)
  const loaded = await import(new URL(variant.module.path, catalogUrl).href)
  const factory = loaded[variant.module.export]
  if (typeof factory !== "function") throw new Error(`Graph story export is missing: ${route}`)
  return (factory as GraphDomStoryFactory)(document)
}

function graphOverviewInputs(catalog: Catalog): GraphOverviewInput[] {
  const rootItems = catalog.categories.map((category) => ({
    route: category.route,
    label: category.label,
    detail: "Graph laboratory category",
    representativeRoute: category.subjects[0]!.variants[0]!.route,
  }))
  return [
    {
      route: "graph",
      title: "Graph · Обзор лаборатории",
      summary: "Независимые проверяемые представления public Graph.",
      items: rootItems,
    },
    ...catalog.categories.flatMap((category): GraphOverviewInput[] => [
      {
        route: category.route,
        title: `${category.label} · Обзор`,
        summary: "Реальные предметы категории показаны явно.",
        items: category.subjects.map((subject) => ({
          route: subject.route,
          label: subject.label,
          detail: subject.apiName,
          representativeRoute: subject.variants[0]!.route,
        })),
      },
      ...category.subjects.map((subject): GraphOverviewInput => ({
        route: subject.route,
        title: `${subject.label} · Обзор`,
        summary: "Все варианты предмета показаны явно.",
        items: subject.variants.map((variant) => ({
          route: variant.route,
          label: variant.label,
          detail: "Точный Graph scenario",
          representativeRoute: variant.route,
        })),
      })),
    ]),
  ]
}
