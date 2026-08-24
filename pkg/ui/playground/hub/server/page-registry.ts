import {join} from "node:path"
import {COMPONENT_STORIES} from "../../../components/playground/stories.ts"
import {ELEMENT_STORIES} from "../../../elements/playground/stories.ts"
import {
  createPlaygroundPage,
  type PlaygroundPage,
} from "@ui/playground/server"
import {definePlaygroundRouteTree} from "@ui/playground"
import {
  UI_PACKAGE_CATALOG,
  type UiPackagePlaygroundId,
} from "../catalog/package-catalog.ts"

export type UiPlaygroundPageId = "catalog" | UiPackagePlaygroundId

type PageFiles = Readonly<{
  entrypoint: string
  stylePath: string
  body: Readonly<{kind: "canvas"; canvasId: string}> | Readonly<{kind: "html"; bodyHtmlPath: string}>
}>

const playgroundRoot = join(import.meta.dir, "../..")
const uiRoot = join(playgroundRoot, "..")

const PAGE_FILES: Readonly<Record<UiPlaygroundPageId, PageFiles>> = Object.freeze({
  catalog: pageFiles({
    entrypoint: join(playgroundRoot, "hub/catalog/catalog-playground.ts"),
    stylePath: join(playgroundRoot, "hub/catalog/catalog-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "hub/catalog/catalog-playground-body.html")},
  }),
  elements: pageFiles({
    entrypoint: join(uiRoot, "elements/playground/entry.ts"),
    stylePath: join(uiRoot, "elements/playground/style.css"),
    body: {kind: "canvas", canvasId: "stage-canvas"},
  }),
  components: pageFiles({
    entrypoint: join(uiRoot, "components/playground/entry.ts"),
    stylePath: join(uiRoot, "components/playground/style.css"),
    body: {kind: "canvas", canvasId: "stage-canvas"},
  }),
  playground: pageFiles({
    entrypoint: join(playgroundRoot, "fixture/entry.ts"),
    stylePath: join(playgroundRoot, "fixture/style.css"),
    body: {kind: "canvas", canvasId: "playground-canvas"},
  }),
  hud: pageFiles({
    entrypoint: join(playgroundRoot, "hub/packages/hud/hud-playground.ts"),
    stylePath: join(playgroundRoot, "hub/packages/hud/hud-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "hub/packages/hud/hud-playground-body.html")},
  }),
})

const CATALOG_ROUTE_TREE = definePlaygroundRouteTree({leaves: [] as const})
const FIXTURE_ROUTE_TREE = definePlaygroundRouteTree({leaves: ["overview", "details"] as const})
const HUD_ROUTE_TREE = definePlaygroundRouteTree({leaves: [] as const})

export function createUiPlaygroundPages(): readonly PlaygroundPage[] {
  const catalog = PAGE_FILES.catalog
  const pages: PlaygroundPage[] = [createPlaygroundPage({
    id: "catalog",
    mountPath: "/",
    packageName: "UI playground",
    entrypoint: catalog.entrypoint,
    stylePath: catalog.stylePath,
    body: catalog.body,
    routeTree: CATALOG_ROUTE_TREE,
  })]
  for (const entry of UI_PACKAGE_CATALOG) {
    const files = PAGE_FILES[entry.id]
    pages.push(createPlaygroundPage({
      id: entry.id,
      mountPath: entry.routePrefix,
      packageName: `UI playground · ${entry.packageName}`,
      entrypoint: files.entrypoint,
      stylePath: files.stylePath,
      body: files.body,
      homePath: "/",
      routeTree: routeTreeFor(entry.id),
    }))
  }
  return Object.freeze(pages)
}

export function uiPlaygroundPageFiles(id: UiPlaygroundPageId): PageFiles {
  return PAGE_FILES[id]
}

function routeTreeFor(id: UiPackagePlaygroundId) {
  if (id === "elements") return ELEMENT_STORIES.routeTree
  if (id === "components") return COMPONENT_STORIES.routeTree
  if (id === "playground") return FIXTURE_ROUTE_TREE
  return HUD_ROUTE_TREE
}

function pageFiles(files: PageFiles): PageFiles {
  return Object.freeze(files)
}
