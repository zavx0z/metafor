import { loadDarkGraph, projectDarkGraphToBulk } from "../../dark"
import type { DarkDownstreamProjection } from "../../dark"

export type BulkGraphContract = DarkDownstreamProjection

export async function loadBulkGraph(metaPath: string): Promise<BulkGraphContract> {
  const graph = await loadDarkGraph(metaPath)
  return projectDarkGraphToBulk(graph)
}

/**
 * @deprecated `Bulk` больше не владеет первичным DSL/meta loading.
 * Используй `loadBulkGraph()` и читай `contract.ast`.
 */
export async function loadDSL(metaPath: string) {
  return (await loadBulkGraph(metaPath)).ast
}
