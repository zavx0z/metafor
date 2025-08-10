import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { ConditionSchema } from "../parser"
import type { ArrayRenderContext, ConditionResult } from "./index.t"

/**
 * Оценивает условие на основе данных контекста и core
 */
export function evaluateCondition<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  condition: ConditionSchema,
  context: ExtractValues<C>,
  core: I,
  arrayContext?: ArrayRenderContext
): ConditionResult {
  let source: any
  let value: any

  // Определяем источник данных
  switch (condition.src) {
    case "context":
      source = context
      break
    case "core":
      source = core
      break
    case "item":
      if (!arrayContext) return false
      source = arrayContext.item
      break
    default:
      return false
  }

  // Получаем значение
  if (condition.key) {
    value = source[condition.key]
  } else {
    value = source
  }

  // Оцениваем условие
  if (condition.eq !== undefined) {
    return value === condition.eq
  }
  if (condition.notEq !== undefined) {
    return value !== condition.notEq
  }
  if (condition.gt !== undefined) {
    return typeof value === "number" && value > condition.gt
  }
  if (condition.gte !== undefined) {
    return typeof value === "number" && value >= condition.gte
  }
  if (condition.lt !== undefined) {
    return typeof value === "number" && value < condition.lt
  }
  if (condition.lte !== undefined) {
    return typeof value === "number" && value <= condition.lte
  }

  return false
}
