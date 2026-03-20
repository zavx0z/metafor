import type { NodeType, NodeMeta } from "@metafor/dsl"
import type { MetaAST } from "../../metafor/ast/ast.t"
import type { Fuzzy } from "@dark/strong"
import type { DarkParticle } from "./shared"


/**
 * Минимальный вход для текущего one-meta dark-прохода.
 *
 * На этом шаге pipeline использует только `matter` и `fields`
 * уже загруженной `MetaAST`.
 */

export type MatterAST = Pick<MetaAST, "matter" | "fields">
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
}
export type MatterEntry = MatterNodeEntry | MatterContinuationEntry
