import type { NodeMeta } from "@metafor/dsl"
import type { FieldInit, WimpFields } from "@dark/types/strong"
import { Wimp } from "./Wimp.ts"
import { resolveNodeFieldInits } from "./fields.ts"

/**
 * Результат подготовки дочернего `Wimp`, вычисленный на стороне родителя.
 *
 * @property fieldInits Временный набор описаний полей, который будет сразу превращён в `childWimp.fields`.
 * @property mass Временное значение `mass` для дочернего `Wimp`.
 */
export interface WimpContinuationBuild {
  /** Временный набор описаний полей, который будет сразу превращён в `childWimp.fields`. */
  fieldInits?: FieldInit[]
  /** Временное значение `mass` для дочернего `Wimp`. */
  mass?: Wimp["mass"]
}

/**
 * Готовит временный пакет данных для дочернего `Wimp`, который обнаружен в родительской мете.
 *
 * На этом шаге сам `Wimp` ещё остаётся пустым: функция только подготавливает
 * временный набор описаний полей `FieldInit[]` и `mass`, которые будут применены позже,
 * когда загрузится схема дочерней меты.
 *
 * Сюда не входят обход дерева, привязка к родителю и запись в `dark$`.
 *
 * @param node AST-узел дочерней меты, найденный в `matter`.
 * @param fields Уже собранные объектные поля родительского `Wimp`.
 * @returns Временный пакет данных для будущей сборки дочернего `Wimp`.
 */
export const resolveWimpContinuation = (
  node: NodeMeta,
  fields?: WimpFields,
): WimpContinuationBuild => {
  const fieldInits = node.fields !== undefined ? resolveNodeFieldInits(node.fields, fields) : undefined
  const continuation: WimpContinuationBuild = {}

  if (fieldInits !== undefined) continuation.fieldInits = fieldInits
  if (node.mass !== undefined) continuation.mass = node.mass

  return continuation
}
