
import type { MetaAST } from "@metafor/ast"
import type { DarkStore, GlobalTopologyPlacement, GlobalTopologyReference, GlobalTopologyEntanglement } from "@dark/types"

/** Потребитель проекции: boundary или bulk. */
export type DarkConsumer = "boundary" | "bulk"

/**
 * Проекция graph state для downstream-потребителя.
 *
 * Содержит снимок состояния для экспорта:
 * - `consumer` — тип потребителя
 * - `meta` — загруженные meta-схемы
 * - `placements` — все placements
 * - `references` — все references
 * - `entanglements` — все entanglements
 */
export interface DarkDownstreamProjection {
  /** Тип потребителя проекции. */
  consumer: DarkConsumer

  /** Загруженные meta-схемы. */
  meta: Map<string, MetaAST>

  /** Все placements графа. */
  placements: GlobalTopologyPlacement[]

  /** Все references графа. */
  references: GlobalTopologyReference[]

  /** Все entanglements графа. */
  entanglements: GlobalTopologyEntanglement[]
}

/**
 * Создаёт проекцию графа для потребителя.
 *
 * **Dark × Electromagnetism:**
 * - перенос `State` в наблюдаемой форме через `Photon`
 * - `Impulse` как содержимое переносимого изменения состояния
 * - доменная связь между скрытой непрерывностью и её наблюдаемыми проекциями
 *
 * @param store$ — dark store
 * @param consumer — тип потребителя (`boundary` для каноникализации, `bulk` для исполнения)
 * @returns проекция графа для downstream-домена
 *
 * @see https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--electromagnetism — ONTOLOGY.md: онтология Dark × Electromagnetism
 * @see https://github.com/zavx0z/metafor/blob/main/docs/proto/electromagnetism.md — proto/electromagnetism.md: протокол Electromagnetism и Photon
 */
export function projectDarkGraph(store$: DarkStore, consumer: DarkConsumer): DarkDownstreamProjection {
  return {
    consumer,
    meta: new Map(store$.meta),
    placements: Array.from(store$.placements.values()),
    references: Array.from(store$.references.values()),
    entanglements: Array.from(store$.entanglements.values()),
  }
}

/**
 * Создаёт проекцию графа для Boundary.
 *
 * @param store$ — dark store
 * @returns проекция графа для boundary consumer
 */
export function projectDarkGraphToBoundary(store$: DarkStore): DarkDownstreamProjection {
  return projectDarkGraph(store$, "boundary")
}

/**
 * Создаёт проекцию графа для Bulk.
 *
 * @param store$ — dark store
 * @returns проекция графа для bulk consumer
 */
export function projectDarkGraphToBulk(store$: DarkStore): DarkDownstreamProjection {
  return projectDarkGraph(store$, "bulk")
}
