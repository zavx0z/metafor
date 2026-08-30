import {describe, expect, test} from "bun:test"
import {
  createDocument,
  Event,
  type Document,
  type HTMLInputElement,
  type HTMLSelectElement,
} from "@zavx0z/dom"
import type {GraphDomStory, GraphDomStoryFactory} from "./stories/dom-story.tsx"
import {runtime} from "./runtime.ts"

type Catalog = Readonly<{
  categories: readonly Readonly<{
    route: string
    label: string
    subjects: readonly Readonly<{
      route: string
      label: string
      apiName: string
      presentation: Readonly<{
        protocol: "story-presentation/1"
        projection: "display" | "world" | "hud"
        widgets: readonly string[]
      }>
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
        expect(subject.presentation).toEqual({
          protocol: "story-presentation/1",
          projection: "display",
          widgets: ["props", "source", "diagnostics"],
        })
        for (const variant of subject.variants) {
          expect("presentation" in variant).toBeFalse()
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
        expect(Object.keys(story.source).sort(), route).toEqual(["html", "typescript"])
        expect(story.source.typescript.length, route).toBeGreaterThan(40)
        expect(story.componentRoot.readStyleSheets().styleSheets.length, route).toBeGreaterThan(0)
      } finally {
        story.dispose()
      }
    }
  })

  test("updates production select and checkbox controls without replacing roots", async () => {
    const catalog = await readCatalog()
    const current = await loadStory(catalog, createDocument(), "graph/document/current/complete")
    const currentRoot = current.element
    const select = current.element.querySelector('[data-control-key="view"] select') as HTMLSelectElement
    select.value = "bulk"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    expect(current.element).toBe(currentRoot)
    expect(current.args).toEqual({view: "bulk"})
    expect(current.source.typescript).toContain("projectBulkGraph(graph)")
    current.dispose()

    const validation = await loadStory(catalog, createDocument(), "graph/validation/contract/closed")
    const validationRoot = validation.element
    const checkbox = validation.element.querySelector(
      '[data-control-key="include-revision"] input',
    ) as HTMLInputElement
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change", {bubbles: true}))
    expect(validation.element).toBe(validationRoot)
    expect(validation.args).toEqual({"include-revision": false})
    expect(validation.source.typescript).toContain("const candidate = graph")
    expect(validation.source.typescript).not.toContain("revision: 17")
    validation.dispose()
  })

  test("publishes one runtime/3 atomic presentation without legacy transports", async () => {
    const manifest = await Bun.file(new URL("./manifest.json", import.meta.url)).json() as {
      authorStyleSheets?: unknown
    }
    const runtimeSource = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()
    const source = await Bun.file(new URL("./stories/source.ts", import.meta.url)).text()
    const domStory = await Bun.file(new URL("./stories/dom-story.tsx", import.meta.url)).text()
    const nodeTree = await Bun.file(new URL("./stories/node-tree.tsx", import.meta.url)).text()

    expect(runtime.protocol).toBe("storybook-runtime/3")
    expect(manifest.authorStyleSheets).toEqual([
      {specifier: "@ui/components/theme.css"},
    ])
    expect(runtimeSource).toContain("update: show")
    expect(runtimeSource).toContain("context.present")
    expect(runtimeSource).toContain('protocol: "story-presentation/1"')
    expect(runtimeSource).toContain("componentRoot: next.componentRoot")
    expect(runtimeSource).toContain("values: Object.freeze({props: next.args})")
    expect(runtimeSource).toContain("current.dispose()")
    expect(runtimeSource).not.toContain("styleSheets:")
    expect(runtimeSource).not.toContain("context.mount")
    expect(runtimeSource).not.toContain("publishInspector")
    expect(runtimeSource).not.toContain("publishSource")
    expect(runtimeSource).not.toContain("publishProps")
    expect(runtimeSource).not.toContain("@zavx0z/storybook")
    expect(runtimeSource).not.toContain("StorybookRouteTreeRouter")
    expect(runtimeSource).not.toContain("createStorybookDomWorkbench")
    expect(runtimeSource).not.toContain("createDocumentCanvasRuntime")
    for (const owner of [source, domStory, nodeTree]) {
      expect(owner).not.toContain("checkboxStyles")
      expect(owner).not.toContain("codeEditorCss")
      expect(owner).not.toContain("listStyles")
      expect(owner).not.toContain("paneStyles")
      expect(owner).not.toContain("resolveWidgetColors")
      expect(owner).not.toContain("rgba8ToColor")
      expect(owner).not.toContain('from "@zavx0z/template"')
    }
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
