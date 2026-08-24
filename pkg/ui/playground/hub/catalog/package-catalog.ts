export type UiPackagePlaygroundId = "elements" | "components" | "playground" | "hud"
export type UiPlaygroundPresentation = "dom" | "webgpu" | "webgpu-diagnostic"

export type UiPackageCatalogEntry = Readonly<{
  id: UiPackagePlaygroundId
  packageName: `@ui/${string}`
  title: string
  summary: string
  playground: string
  routePrefix: `/${string}`
  defaultRoute: `/${string}`
  presentation: UiPlaygroundPresentation
}>

export const UI_PACKAGE_CATALOG: readonly UiPackageCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "elements",
    packageName: "@ui/elements",
    title: "Элементы UI",
    summary: "WebGPU-примитивы, FlexBox, retained-владельцы, ввод, прокрутка и тема.",
    playground: "Сохраняет все принадлежащие Elements сценарии и их точные production imports.",
    routePrefix: "/elements",
    defaultRoute: "/elements/",
    presentation: "webgpu",
  }),
  Object.freeze({
    id: "components",
    packageName: "@ui/components",
    title: "Компоненты UI",
    summary: "Универсальные controls и Fields, составленные из Elements.",
    playground: "Сохраняет полный каталог сценариев Components, controls, исходник и retained preview.",
    routePrefix: "/components",
    defaultRoute: "/components/",
    presentation: "webgpu",
  }),
  Object.freeze({
    id: "playground",
    packageName: "@ui/playground",
    title: "Инфраструктура Workbench",
    summary: "Типизированное дерево маршрутов, registry сценариев, пятипанельный shell и no-HMR server.",
    playground: "Показывает существующий диагностический fixture общей инфраструктуры.",
    routePrefix: "/playground",
    defaultRoute: "/playground/",
    presentation: "webgpu-diagnostic",
  }),
  Object.freeze({
    id: "hud",
    packageName: "@ui/hud",
    title: "HUD",
    summary: "HUD-панели, визуальные controls, взаимодействие с рамкой и timeline.",
    playground: "Честная DOM-страница состава package: отдельного visual stand сейчас нет.",
    routePrefix: "/hud",
    defaultRoute: "/hud/",
    presentation: "dom",
  }),
])

const CATALOG_BY_ID = new Map(UI_PACKAGE_CATALOG.map((entry) => [entry.id, entry]))

export function uiPackageCatalogEntry(id: UiPackagePlaygroundId): UiPackageCatalogEntry {
  const entry = CATALOG_BY_ID.get(id)
  if (entry === undefined) throw new Error(`Unknown UI package playground: ${id}`)
  return entry
}
