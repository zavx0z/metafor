export const NODES_CATALOG_ROUTE = "/" as const

export type NodesPackagePlaygroundId =
  | "core"
  | "editor"
  | "layout"
  | "layout-worker"
  | "ui"

export type NodesPlaygroundPresentation = "dom" | "svg" | "webgpu"

export type NodesPackageCatalogEntry = Readonly<{
  id: NodesPackagePlaygroundId
  packageName: `@nodes/${string}`
  title: string
  summary: string
  playground: string
  routePrefix: `/${string}`
  defaultRoute: `/${string}`
  presentation: NodesPlaygroundPresentation
}>

export const NODES_PACKAGE_CATALOG: readonly NodesPackageCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "core",
    packageName: "@nodes/core",
    title: "Живой граф",
    summary: "NodeTree, Parameter, revisions, snapshot и атомарная смена topology.",
    playground: "Сравнивает runtime definition, ID-keyed document, JSON snapshot и события одного дерева.",
    routePrefix: "/core",
    defaultRoute: "/core/live-node-tree",
    presentation: "dom",
  }),
  Object.freeze({
    id: "editor",
    packageName: "@nodes/editor",
    title: "Редактор графа",
    summary: "JSON Patch-команды add/remove/connect/disconnect над живым NodeTree.",
    playground: "Редактирует Node, Parameter и Link, затем отдельно перестраивает layout и WebGPU projection.",
    routePrefix: "/editor",
    defaultRoute: "/editor/live-node-tree",
    presentation: "webgpu",
  }),
  Object.freeze({
    id: "layout",
    packageName: "@nodes/layout",
    title: "Числовая раскладка",
    summary: "Fixed/adaptive placement и ортогональный routing без UI и NodeTree.",
    playground: "Запускает frozen RIGHT/DOWN fixtures и показывает точный результат как DOM/SVG и JSON.",
    routePrefix: "/layout",
    defaultRoute: "/layout/fixed-adaptive",
    presentation: "svg",
  }),
  Object.freeze({
    id: "layout-worker",
    packageName: "@nodes/layout-worker",
    title: "Worker-протокол",
    summary: "Serializable request/result/error envelopes для fixed и adaptive executors.",
    playground: "Показывает точный wire request, generation, response и typed failure без main-thread fallback.",
    routePrefix: "/layout-worker",
    defaultRoute: "/layout-worker/protocol",
    presentation: "dom",
  }),
  Object.freeze({
    id: "ui",
    packageName: "@nodes/ui",
    title: "Компоненты Node UI",
    summary: "NodeEditor, Frame, Node, Parameter, Socket и Link renderers.",
    playground: "Сохраняет полный WebGPU story catalog, Blender comparison, controls и retained diagnostics.",
    routePrefix: "/ui",
    defaultRoute: "/ui/socket/boolean/input",
    presentation: "webgpu",
  }),
])

const CATALOG_BY_ID = new Map(NODES_PACKAGE_CATALOG.map((entry) => [entry.id, entry]))

export function nodesPackageCatalogEntry(id: NodesPackagePlaygroundId): NodesPackageCatalogEntry {
  const entry = CATALOG_BY_ID.get(id)
  if (entry === undefined) throw new Error(`Unknown Nodes package playground: ${id}`)
  return entry
}

export function nodesPackageForPath(pathname: string): NodesPackageCatalogEntry | null {
  const path = normalizePathname(pathname)
  if (path === NODES_CATALOG_ROUTE) return null
  return NODES_PACKAGE_CATALOG.find(({routePrefix}) =>
    path === routePrefix || path.startsWith(`${routePrefix}/`)) ?? null
}

export function normalizePathname(pathname: string): string {
  if (pathname.length === 0) return NODES_CATALOG_ROUTE
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  return path.length > 1 ? path.replace(/\/+$/g, "") : path
}
