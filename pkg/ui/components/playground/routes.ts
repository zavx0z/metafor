import type {ButtonColor, ButtonSize} from "@ui/components"
import type {PlaygroundInfoOptions, PlaygroundNavigationItem} from "@ui/playground"
import {
  FIELD_ROUTES,
  FIELD_SECTIONS,
  fieldRouteFromSection,
  fieldSectionFromRoute,
  type FieldRoute,
} from "./fields.ts"

export type ButtonRouteVariant = "text" | "contained" | "outlined"
export type ButtonRouteIconLabel = "left" | "right"
export type PaneVariant = "glass" | "outlined" | "filled"
export type PaneRoute = "pane/variants" | `pane/variants/${PaneVariant}`
export type ButtonRoute =
  | "button/basic"
  | `button/basic/${ButtonRouteVariant}`
  | "button/icon-label"
  | `button/icon-label/${ButtonRouteIconLabel}`
  | "button/sizes"
  | `button/sizes/${ButtonSize}`
  | "button/color"
  | `button/color/${ButtonColor}`
  | "button/icon"
  | "button/icon/svg"
export type ComponentsRoute = ButtonRoute | PaneRoute | FieldRoute
export type ComponentsCatalogRoute = ComponentsRoute | `disabled/${string}`

export const BUTTON_ROUTES = Object.freeze([
  "button/basic",
  "button/basic/text",
  "button/basic/contained",
  "button/basic/outlined",
  "button/icon-label",
  "button/icon-label/left",
  "button/icon-label/right",
  "button/sizes",
  "button/sizes/small",
  "button/sizes/medium",
  "button/sizes/large",
  "button/color",
  "button/color/primary",
  "button/color/success",
  "button/color/warning",
  "button/color/error",
  "button/color/neutral",
  "button/icon",
  "button/icon/svg",
] as const satisfies readonly ButtonRoute[])

export const PANE_ROUTES = Object.freeze([
  "pane/variants",
  "pane/variants/glass",
  "pane/variants/outlined",
  "pane/variants/filled",
] as const satisfies readonly PaneRoute[])

export const COMPONENT_PLAYGROUND_ROUTES = Object.freeze([
  ...BUTTON_ROUTES,
  ...PANE_ROUTES,
  ...FIELD_ROUTES,
] as const satisfies readonly ComponentsRoute[])

export const COMPONENT_PLAYGROUND_CATALOG: readonly PlaygroundNavigationItem<ComponentsCatalogRoute>[] = [
  {id: "button", label: "Button", route: "button/basic"},
  {id: "pane", label: "Pane", route: "pane/variants"},
  {id: "field", label: "Field", route: "field/values"},
  {id: "badge", label: "Badge", route: "disabled/badge", disabled: true},
  {id: "text-field", label: "TextField", route: "disabled/text-field", disabled: true},
  {id: "divider", label: "Divider", route: "disabled/divider", disabled: true},
  {id: "scrollbar", label: "Scrollbar", route: "disabled/scrollbar", disabled: true},
  {id: "scroll-list", label: "Scroll List", route: "disabled/scroll-list", disabled: true},
  {id: "noti-stack", label: "Noti Stack", route: "disabled/noti-stack", disabled: true},
]

const BUTTON_SECTIONS: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "basic", label: "Basic", route: "button/basic"},
  {id: "icon", label: "Icon", route: "button/icon"},
  {id: "icon-label", label: "Icon+Label", route: "button/icon-label"},
  {id: "sizes", label: "Sizes", route: "button/sizes"},
  {id: "color", label: "Color", route: "button/color"},
]

const PANE_SECTIONS: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "variants", label: "Variants", route: "pane/variants"},
]

const FIELD_SECTION_ITEMS: readonly PlaygroundNavigationItem<ComponentsRoute>[] = FIELD_SECTIONS.map((section) => ({
  id: section.toLowerCase(),
  label: section,
  route: fieldRouteFromSection(section),
}))

const BASIC_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "text", label: "Text", route: "button/basic/text"},
  {id: "contained", label: "Contained", route: "button/basic/contained"},
  {id: "outlined", label: "Outlined", route: "button/basic/outlined"},
]

const ICON_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "svg", label: "svg", route: "button/icon/svg"},
]

const ICON_LABEL_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "left", label: "left", route: "button/icon-label/left"},
  {id: "right", label: "right", route: "button/icon-label/right"},
]

const SIZE_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "small", label: "small", route: "button/sizes/small"},
  {id: "medium", label: "medium", route: "button/sizes/medium"},
  {id: "large", label: "large", route: "button/sizes/large"},
]

const COLOR_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "primary", label: "primary", route: "button/color/primary"},
  {id: "success", label: "success", route: "button/color/success"},
  {id: "warning", label: "warning", route: "button/color/warning"},
  {id: "error", label: "error", route: "button/color/error"},
]

const PANE_DOCK: readonly PlaygroundNavigationItem<ComponentsRoute>[] = [
  {id: "glass", label: "Glass", route: "pane/variants/glass"},
  {id: "outlined", label: "Outlined", route: "pane/variants/outlined"},
  {id: "filled", label: "Filled", route: "pane/variants/filled"},
]

export function isComponentsRoute(route: string): route is ComponentsRoute {
  return (COMPONENT_PLAYGROUND_ROUTES as readonly string[]).includes(route)
}

export function componentsPlaygroundCatalogRoute(route: ComponentsRoute): ComponentsCatalogRoute {
  if (route.startsWith("field/")) return "field/values"
  if (route.startsWith("pane/")) return "pane/variants"
  return "button/basic"
}

export function componentsPlaygroundSections(route: ComponentsRoute): readonly PlaygroundNavigationItem<ComponentsRoute>[] {
  if (route.startsWith("field/")) return FIELD_SECTION_ITEMS
  if (route.startsWith("pane/")) return PANE_SECTIONS
  return BUTTON_SECTIONS
}

export function componentsPlaygroundSectionRoute(route: ComponentsRoute): ComponentsRoute {
  if (route.startsWith("field/")) return route
  if (route.startsWith("pane/")) return "pane/variants"
  if (route.startsWith("button/icon-label")) return "button/icon-label"
  if (route.startsWith("button/icon")) return "button/icon"
  if (route.startsWith("button/sizes")) return "button/sizes"
  if (route.startsWith("button/color")) return "button/color"
  return "button/basic"
}

export function componentsPlaygroundSectionTitle(route: ComponentsRoute): string {
  if (route.startsWith("field/")) return "Field"
  if (route.startsWith("pane/")) return "Pane"
  return "Button"
}

export function componentsPlaygroundDock(route: ComponentsRoute): readonly PlaygroundNavigationItem<ComponentsRoute>[] {
  if (route.startsWith("field/")) return FIELD_SECTION_ITEMS
  if (route.startsWith("pane/")) return PANE_DOCK
  if (route.startsWith("button/icon-label")) return ICON_LABEL_DOCK
  if (route.startsWith("button/icon")) return ICON_DOCK
  if (route.startsWith("button/sizes")) return SIZE_DOCK
  if (route.startsWith("button/color")) return COLOR_DOCK
  return BASIC_DOCK
}

export function componentsPlaygroundInfo(route: ComponentsRoute): PlaygroundInfoOptions {
  if (route.startsWith("field/")) return {
    title: "Field contract",
    lines: [
      {id: "owner", label: "Owner: @ui/components"},
      {id: "reuse", label: "Reused inside Node and outside it"},
      {id: "section", label: `Section: ${fieldSectionFromRoute(route as FieldRoute)}`},
      {id: "control", label: "Controlled immutable values"},
    ],
    status: route,
  }
  if (route.startsWith("pane/")) return {
    title: "Pane contract",
    lines: ["Glass", "Outlined", "Filled", "Rounded WebGPU surfaces"],
    status: route,
  }
  return {
    title: "Button contract",
    lines: ["Text / contained / outlined", "Icon and label", "Size and color", "Controlled interaction"],
    status: route,
  }
}
