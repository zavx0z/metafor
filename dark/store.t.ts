import type { MetaAST } from "@metafor/ast"
import type { NodeCondition, NodeLogical, NodeMap, NodeMeta } from "@metafor/template"
import type { GlobalTopologySnapshot, GlobalTopologyStore } from "./ap/store.t"

export interface DarkStoreSnapshot {
  meta: Map<string, MetaAST>
  topology: GlobalTopologySnapshot
}

export interface DarkStore extends DarkStoreSnapshot {
  reset(): void
  restore(snapshot: DarkStoreSnapshot): void
  snapshot(): DarkStoreSnapshot
  setMeta(address: string, meta: MetaAST): MetaAST
  getMeta(address: string): MetaAST | undefined
  topology: GlobalTopologyStore
}

/**
 * WIMP.
 *
 * Скрытая структурная единица тёмного пространства:
 * отдельный meta-узел с собственной латентной идентичностью.
 */
export type WIMP = NodeMeta

/**
 * Axion.
 *
 * Тонкий скрытый активатор ветви:
 * логический медиатор, который разрешает или блокирует её проявление.
 */
export type Axion = NodeLogical

/**
 * Fuzzy.
 *
 * Условная структура выбора ветви.
 *
 * Может выражать выбор по `state` как состоянию
 * или по `enum` как topology-основе ветвления.
 */
export type Fuzzy = NodeCondition

/**
 * MACHO.
 *
 * Массивное множественное тело:
 * структура разворачивания множества, чьей полевой основой является `array`.
 */
export type MACHO = NodeMap
