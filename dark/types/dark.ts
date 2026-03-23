import type { NodeType, NodeMeta } from "@metafor/dsl"
import type { Fuzzy, Wimp } from "@dark/strong"
import type { MetaAST } from "../../metafor/ast/ast.t"
import type { DarkParticle } from "./shared"
import type { FieldInit } from "./strong.ts"

/**
 * Минимальный вход для текущего one-meta dark-прохода.
 *
 * На этом шаге pipeline использует только `matter`, `fields` и `mass`
 * уже загруженной `MetaAST`.
 */
export type MatterAST = Pick<MetaAST, "matter" | "fields" | "mass">

/**
 * Временный build-пакет, который родительская meta передаёт обнаруженному дочернему `Wimp`.
 *
 * Сам `Wimp` при обнаружении ещё остаётся пустым. Этот пакет применяется позже,
 * когда meta дочернего `Wimp` уже загружена и он передаётся в `matterPipeline`.
 * После materialization он больше не является каноническим слоем хранения.
 */
export interface MatterContinuation {
  /** Временный build-пакет полей для materialization дочернего `Wimp`. */
  fieldInits?: FieldInit[]
  /** Временный payload `mass`, приходящий от родителя. */
  mass?: Wimp["mass"]
}

/**
 * Возвращаемая пара: обнаруженный `Wimp` и continuation от его родителя.
 */
export type MatterWimpResult = [wimp: Wimp, continuation: MatterContinuation]

/**
 * Результат одного слоя `matterPipeline`.
 *
 * Pipeline yield-ит такой массив на каждом уровне обхода, даже если на этом шаге
 * новые `Wimp` не появились. Это сохраняет явную границу между слоями traversal.
 */
export type MatterLayerResult = MatterWimpResult[]

/**
 * Локальная запись frontier для прямого one-meta traversal.
 *
 * Эта нормализация остаётся полностью внутренней для `dark` и не является
 * архитектурным контрактом pipeline снаружи.
 */
export interface MatterNodeEntry {
  /** Обычный AST-узел текущего слоя. */
  kind: "node"
  node: NodeType
  parent: DarkParticle
}
/**
 * Локальная continuation-запись для dynamic meta после materialization её Fuzzy-узла.
 */
export interface MatterContinuationEntry {
  /** Уже разрешённая continuation-ветвь dynamic meta. */
  kind: "continuation"
  node: NodeMeta
  parent: Fuzzy
  src: string
  continuation: MatterContinuation
}

/**
 * Внутренний frontier entry текущего traversal-шага.
 */
export type MatterEntry = MatterNodeEntry | MatterContinuationEntry
