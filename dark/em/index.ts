/**
 * `@dark/em` — projection/export contract подготовленного graph state.
 *
 * **Сила Electromagnetism в Dark (`Dark × Electromagnetism`):**
 * - проекция к другим доменам и перенос `State` в наблюдаемой форме через `Photon`
 * - сообщение скрытого изменения как сигнала состояния
 * - распространение обновлений, порождённых состоянием
 * - перенос доменного состояния в проекции
 * - вынесение `Impulse` как содержимого изменения состояния
 *
 * **Ответственность пакета:**
 * - projection contracts — контракты проекции из `Dark`
 * - export prepared graph state — экспорт подготовленного состояния графа
 * - downstream projections — проекции для `Boundary` и `Bulk`
 *
 * Использует синглтон `dark$` для проекций в Boundary и Bulk.
 * Не является каналом исполнения и не дублирует `boundary/em` или `bulk/em`.
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--electromagnetism | ONTOLOGY.md} — онтология Dark × Electromagnetism
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ARCHITECTURE.md#dark--electromagnetism | ARCHITECTURE.md} — архитектура Dark × Electromagnetism
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/electromagnetism.md | proto/electromagnetism.md} — протокол Electromagnetism и Photon
 */

import type { MetaAST } from "@metafor/ast"
import { dark$ } from "@dark/gravity"
import type { GlobalTopologyPlacement, GlobalTopologyReference, GlobalTopologyEntanglement } from "@dark/gravity"

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
 * @param consumer — тип потребителя (`boundary` для каноникализации, `bulk` для исполнения)
 * @returns проекция графа для downstream-домена
 *
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/ONTOLOGY.md#dark--electromagnetism | ONTOLOGY.md} — онтология Dark × Electromagnetism
 * @see {@link https://github.com/zavx0z/metafor/blob/main/docs/proto/electromagnetism.md | proto/electromagnetism.md} — протокол Electromagnetism и Photon
 */
export function projectDarkGraph(consumer: DarkConsumer): DarkDownstreamProjection {
  return {
    consumer,
    meta: new Map(dark$.meta),
    placements: Array.from(dark$.placements.values()),
    references: Array.from(dark$.references.values()),
    entanglements: Array.from(dark$.entanglements.values()),
  }
}

/**
 * Создаёт проекцию графа для Boundary.
 *
 * @returns проекция графа для boundary consumer
 */
export function projectDarkGraphToBoundary(): DarkDownstreamProjection {
  return projectDarkGraph("boundary")
}

/**
 * Создаёт проекцию графа для Bulk.
 *
 * @returns проекция графа для bulk consumer
 */
export function projectDarkGraphToBulk(): DarkDownstreamProjection {
  return projectDarkGraph("bulk")
}
