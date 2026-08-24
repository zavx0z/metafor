import {join} from "node:path"
import {createPlaygroundPage, type PlaygroundPage} from "@ui/playground/server"
import {
  NODES_PACKAGE_CATALOG,
  nodesPackageCatalogEntry,
  type NodesPackagePlaygroundId,
} from "../catalog/package-catalog.ts"
import {nodesPackageRouteTree} from "../catalog/package-route-manifest.ts"

export type NodesPlaygroundPageId = "catalog" | NodesPackagePlaygroundId

type PageFiles = Readonly<{
  entrypoint: string
  stylePath: string
  body: Readonly<{kind: "canvas"; canvasId: string}> | Readonly<{kind: "html"; bodyHtmlPath: string}>
  deepRoutes?: boolean
}>

const playgroundRoot = join(import.meta.dir, "..")

const PAGE_FILES: Readonly<Record<NodesPlaygroundPageId, PageFiles>> = Object.freeze({
  catalog: pageFiles({
    entrypoint: join(playgroundRoot, "catalog/catalog-playground.ts"),
    stylePath: join(playgroundRoot, "catalog/catalog-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "catalog/catalog-playground-body.html")},
    deepRoutes: false,
  }),
  core: pageFiles({
    entrypoint: join(playgroundRoot, "packages/core/core-playground.ts"),
    stylePath: join(playgroundRoot, "packages/core/core-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "packages/core/core-playground-body.html")},
  }),
  editor: pageFiles({
    entrypoint: join(playgroundRoot, "packages/editor/editor-playground.ts"),
    stylePath: join(playgroundRoot, "packages/editor/editor-playground.css"),
    body: {kind: "canvas", canvasId: "nodes-playground-canvas"},
  }),
  layout: pageFiles({
    entrypoint: join(playgroundRoot, "packages/layout/layout-playground.ts"),
    stylePath: join(playgroundRoot, "packages/layout/layout-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "packages/layout/layout-playground-body.html")},
  }),
  "layout-worker": pageFiles({
    entrypoint: join(playgroundRoot, "packages/layout-worker/layout-worker-playground.ts"),
    stylePath: join(playgroundRoot, "packages/layout-worker/layout-worker-playground.css"),
    body: {kind: "html", bodyHtmlPath: join(playgroundRoot, "packages/layout-worker/layout-worker-playground-body.html")},
  }),
  ui: pageFiles({
    entrypoint: join(playgroundRoot, "packages/ui/ui-playground.ts"),
    stylePath: join(playgroundRoot, "packages/ui/ui-playground.css"),
    body: {kind: "canvas", canvasId: "nodes-playground-canvas"},
  }),
})

export function createNodesPlaygroundPages(): readonly PlaygroundPage[] {
  const catalogFiles = PAGE_FILES.catalog
  const pages: PlaygroundPage[] = [createPlaygroundPage({
    id: "catalog",
    mountPath: "/",
    packageName: "Nodes playground",
    entrypoint: catalogFiles.entrypoint,
    stylePath: catalogFiles.stylePath,
    body: catalogFiles.body,
    deepRoutes: false,
  })]
  for (const entry of NODES_PACKAGE_CATALOG) {
    const files = PAGE_FILES[entry.id]
    pages.push(createPlaygroundPage({
      id: entry.id,
      mountPath: entry.routePrefix,
      packageName: `Nodes playground · ${entry.packageName}`,
      entrypoint: files.entrypoint,
      stylePath: files.stylePath,
      body: files.body,
      homePath: "/",
      routeTree: nodesPackageRouteTree(entry.id),
    }))
  }
  return Object.freeze(pages)
}

export function nodesPlaygroundPageDefaultRoute(id: NodesPackagePlaygroundId): string {
  return nodesPackageCatalogEntry(id).defaultRoute
}

export function nodesPlaygroundPageFiles(id: NodesPlaygroundPageId): PageFiles {
  return PAGE_FILES[id]
}

function pageFiles(files: PageFiles): PageFiles {
  return Object.freeze(files)
}
