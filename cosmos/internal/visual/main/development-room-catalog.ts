import type {DevelopmentPackage, DevelopmentSourceNode} from "../../../release/shared/development"

/** Идентификатор узла остаётся в событии Workbench; Window маршрутизирует только адрес Package. */
export function developmentRoomCatalogItems(pkg: DevelopmentPackage, nodes: readonly DevelopmentSourceNode[]) {
  const nodeIds = new Set(nodes.map(node => node.id))
  return nodes.map(node => ({
    id: node.id,
    label: node.label,
    route: pkg.address,
    searchText: `${node.label} ${node.sourcePath}`,
    ...(node.parentId && nodeIds.has(node.parentId) ? {parentId: node.parentId} : {}),
  }))
}
