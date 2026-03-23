import type { NodeMeta } from "@metafor/dsl"
import type { FieldInit, WimpFields } from "@dark/types/strong"
import { Wimp } from "./Wimp.ts"
import { resolveNodeFieldInits } from "./fields.ts"

/**
 * Результат build-подготовки дочернего `Wimp`, вычисленный на стороне родителя.
 */
export interface WimpContinuationBuild {
  /** Временный набор field init, который будет сразу materialize-нут в child `Wimp.fields`. */
  fieldInits?: FieldInit[]
  /** Временный payload `mass` для child `Wimp`. */
  mass?: Wimp["mass"]
}

/**
 * Вычисляет continuation для дочернего `Wimp`, приходящий от родительской meta.
 *
 * На этом шаге сам `Wimp` ещё остаётся пустым: continuation только сохраняет
 * временный build-пакет `FieldInit[]` и `mass`, которые будут применены позже
 * при загрузке meta схемы и передаче этого `Wimp` в `matterPipeline`.
 *
 * Traversal, parent resolution и wiring в `dark$` сюда не входят.
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
