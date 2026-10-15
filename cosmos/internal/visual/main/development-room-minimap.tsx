import {useMemo} from "@zavx0z/immersive/XReact"
import Minimap, {type StorybookAppWebPageShellMinimap} from "@zavx0z/storybook-app-web-page-shell-minimap"
import type {DevelopmentCatalog} from "../../../release/shared/development"

/** Все source Package остаются адресуемыми, а external names не получают комнаты. */
export function sourcePackageCatalog(catalog: DevelopmentCatalog) {
  const packages = catalog.packages.filter(pkg => pkg.resolution === "source")
  const names = new Set(packages.map(pkg => pkg.name))
  return {names, items: packages.map(pkg => ({id: pkg.name, label: pkg.label, route: pkg.address,
    searchText: pkg.name, ...(pkg.ownerName && names.has(pkg.ownerName) ? {parentId: pkg.ownerName} : {})}))}
}

/** Source-only Package forest uses the public Storybook catalog in the shared HUD. */
export function DevelopmentRoomMinimap(props: Readonly<{
  catalog: DevelopmentCatalog
  selectedPackage: string | null
  search: string
  collapsedIds: readonly string[] | undefined
  initialState: StorybookAppWebPageShellMinimap.Output | undefined
  onSearch(value: string): void
  onCollapsedIds(ids: readonly string[]): void
  onStateChange(state: StorybookAppWebPageShellMinimap.Output): void
  onSelectPackage(name: string): void
}>) {
  const source = useMemo(() => sourcePackageCatalog(props.catalog), [props.catalog])
  return <Minimap
    projectName="Cosmos · Пакеты"
    initialState={props.initialState}
    onStateChange={props.onStateChange}
    catalog={{
      label: "Исходные Package",
      search: props.search,
      items: source.items,
      activeId: props.selectedPackage && source.names.has(props.selectedPackage) ? props.selectedPackage : null,
      management: null,
      onAction() {},
      onNavigate(item) {if (source.names.has(item.id)) props.onSelectPackage(item.id)},
      onSearch(value) {props.onSearch(value)},
      onGroupToggle() {},
      navigationExpansion: {
        ...(props.collapsedIds === undefined ? {} : {initialCollapsedIds: props.collapsedIds}),
        save: props.onCollapsedIds,
      },
    }}
  />
}
