import type { NodeType, NodeMeta } from "@metafor/dsl"
import type { Fuzzy, Wimp } from "@dark/strong"
import type { MetaAST } from "../../metafor/ast/ast.t"
import type { DarkParticle } from "./shared"

/**
 * Минимальный вход для текущего one-meta dark-прохода.
 *
 * На этом шаге pipeline использует только `matter`, `fields` и `mass`
 * уже загруженной `MetaAST`.
 */
export type MatterAST = Pick<MetaAST, "matter" | "fields" | "mass">

/**
 * Continuation, который родительская meta передаёт обнаруженному дочернему `Wimp`.
 *
 * Сам `Wimp` при обнаружении ещё остаётся пустым. Этот payload применяется позже,
 * когда meta дочернего `Wimp` уже загружена и он передаётся в `matterPipeline`.
 */
export interface MatterContinuation {
  values?: Wimp["values"]
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
  kind: "node"
  node: NodeType
  parent: DarkParticle
}
/**
 * Локальная continuation-запись для dynamic meta после materialization её Fuzzy-узла.
 */
export interface MatterContinuationEntry {
  kind: "continuation"
  node: NodeMeta
  parent: Fuzzy
  src: string
  continuation: MatterContinuation
}
export type MatterEntry = MatterNodeEntry | MatterContinuationEntry
