import type { NodeType, NodeMeta } from "@metafor/dsl"
import type { Fuzzy, Wimp } from "@dark/strong"
import type { MetaAST } from "../../metafor/ast/ast.t"
import type { DarkParticle } from "./shared"
import type { FieldInit } from "./strong.ts"

/**
 * Минимальный вход для текущего one-meta dark-прохода.
 *
 * На этом шаге проход использует только `matter`, `fields` и `mass`
 * уже загруженной `MetaAST`.
 */
export type MatterAST = Pick<MetaAST, "matter" | "fields" | "mass">

/**
 * Временный пакет данных, который родительская мета передаёт обнаруженному дочернему `Wimp`.
 *
 * Сам `Wimp` при обнаружении ещё остаётся пустым. Этот пакет применяется позже,
 * когда мета дочернего `Wimp` уже загружена и он передаётся в `matterMeta`.
 * После применения этот пакет больше не является каноническим слоем хранения.
 *
 * @property fieldInits Временный набор описаний полей для сборки дочернего `Wimp`.
 * @property mass Временное значение `mass`, приходящее от родителя.
 */
export interface MatterContinuation {
  /** Временный набор описаний полей для сборки дочернего `Wimp`. */
  fieldInits?: FieldInit[]
  /** Временное значение `mass`, приходящее от родителя. */
  mass?: Wimp["mass"]
}

/**
 * Возвращаемая пара: обнаруженный `Wimp` и временный пакет данных от его родителя.
 */
export type MatterWimpResult = [wimp: Wimp, continuation: MatterContinuation]

/**
 * Результат одного слоя `matterMeta`.
 *
 * Генератор отдаёт такой массив на каждом уровне обхода, даже если на этом шаге
 * новые `Wimp` не появились. Это сохраняет явную границу между слоями traversal.
 */
export type MatterLayerResult = MatterWimpResult[]

/**
 * Локальная запись очереди обхода для прямого one-meta traversal.
 *
 * Эта нормализация остаётся полностью внутренней для `dark` и не является
 * внешним архитектурным контрактом.
 *
 * @property kind Дискриминатор обычного AST-узла.
 * @property node Текущий топологический узел AST.
 * @property parent Уже собранный родитель для этого узла.
 */
export interface MatterNodeEntry {
  /** Обычный AST-узел текущего слоя. */
  kind: "node"
  node: NodeType
  parent: DarkParticle
}
/**
 * Локальная запись временного пакета для динамической меты после создания её `Fuzzy`-узла.
 *
 * @property kind Дискриминатор уже разрешённой ветви.
 * @property node Исходный динамический meta-узел AST.
 * @property parent Runtime `Fuzzy`, владеющий ветвлением.
 * @property src Уже вычисленный адрес дочерней меты.
 * @property continuation Временный пакет данных для будущего дочернего `Wimp`.
 */
export interface MatterContinuationEntry {
  /** Уже разрешённая ветвь динамической меты. */
  kind: "continuation"
  node: NodeMeta
  parent: Fuzzy
  src: string
  continuation: MatterContinuation
}

/**
 * Внутренняя запись очереди текущего шага обхода.
 */
export type MatterEntry = MatterNodeEntry | MatterContinuationEntry
