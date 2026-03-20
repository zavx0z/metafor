import type { NodeType } from "@metafor/dsl"
import type { DarkParticle } from "./shared.ts"

/**
 * Родительская сущность для seed: либо частица, либо другой seed.
 * @prop kind Тип частицы
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
export type SeedParent = DarkParticle | ParticleSeed

type MetaNode = Extract<NodeType, { type: "meta" }>
type ConditionNode = Extract<NodeType, { type: "cond" }>
type LogicalNode = Extract<NodeType, { type: "log" }>
type MapNode = Extract<NodeType, { type: "map" }>

/**
 * Базовая структура seed.
 * @prop kind Тип частицы
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
interface SeedBase {
  kind: "wimp" | "fuzzy" | "axion" | "macho"
  parent: SeedParent
  meta: Record<string, never>
}

/**
 * Seed для создания Wimp.
 * @prop kind Тип частицы ("wimp")
 * @prop src SRC-адрес меты
 * @prop node AST-узел meta
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
export interface WimpSeed extends SeedBase {
  kind: "wimp"
  src: string
  node: MetaNode
}

/**
 * Seed для создания Fuzzy.
 * @prop kind Тип частицы ("fuzzy")
 * @prop node AST-узел meta или cond
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
export interface FuzzySeed extends SeedBase {
  kind: "fuzzy"
  node: MetaNode | ConditionNode
}

/**
 * Seed для создания Axion.
 * @prop kind Тип частицы ("axion")
 * @prop node AST-узел log
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
export interface AxionSeed extends SeedBase {
  kind: "axion"
  node: LogicalNode
}

/**
 * Seed для создания Macho.
 * @prop kind Тип частицы ("macho")
 * @prop node AST-узел map
 * @prop parent Родительская сущность
 * @prop meta Резервированное поле для будущих метаданных
 */
export interface MachoSeed extends SeedBase {
  kind: "macho"
  node: MapNode
}

/**
 * Union-тип всех seed.
 */
export type ParticleSeed = WimpSeed | FuzzySeed | AxionSeed | MachoSeed

/**
 * Внутренний тип для слоя обхода в particleGenerator.
 * @prop node AST-узел
 * @prop parent Родительская сущность
 */
export interface LayerNode {
  node: NodeType
  parent: SeedParent
}

/**
 * Внутренний тип для слоя обхода в particleGenerator.
 */
export type LayerEntry = LayerNode | ParticleSeed
