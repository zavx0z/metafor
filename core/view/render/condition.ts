import type { ContextSchema, ExtractValues } from "../../context"
import type { Core } from "../../index.t"
import type { ConditionSchema, ElementSchema, Schema } from "../parser"
import type { ArrayRenderContext, ConditionResult } from "./index.t"

/**
 * Оценивает условие на основе данных контекста и core
 */
export function evaluateCondition<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  schema: ConditionSchema,
  context: ExtractValues<C>,
  core: I,
  arrayContext?: ArrayRenderContext
): ConditionResult {
  let source: any
  let value: any

  // Определяем источник данных
  switch (schema.src) {
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
  if (schema.key) {
    value = source[schema.key]
  } else {
    value = source
  }

  // Оцениваем условие
  if (schema.eq !== undefined) {
    return value === schema.eq
  }
  if (schema.notEq !== undefined) {
    return value !== schema.notEq
  }
  if (schema.gt !== undefined) {
    return typeof value === "number" && value > schema.gt
  }
  if (schema.gte !== undefined) {
    return typeof value === "number" && value >= schema.gte
  }
  if (schema.lt !== undefined) {
    return typeof value === "number" && value < schema.lt
  }
  if (schema.lte !== undefined) {
    return typeof value === "number" && value <= schema.lte
  }

  return false
}
/**
 * Группирует подряд идущие элементы с одинаковыми cond.src/cond.key
 * и выбирает первый удовлетворяющий условию. Остальные отбрасываются.
 */
export function resolveConditionalSequences<C extends ContextSchema, S extends string, I extends Core>(
  state: S,
  list: Schema,
  context: any,
  core: any
): Schema {
  const result: Schema = []
  let i = 0
  while (i < list.length) {
    const item = list[i]!
    // Только элементы с cond участвуют в группировке
    if (item.type === "el" && item.cond && item.cond.src && item.cond.key) {
      const group: ElementSchema[] = [item]
      const { src, key } = item.cond
      let j = i + 1
      while (j < list.length) {
        const next = list[j]!
        if (next.type === "text") {
          j++
          continue
        }
        if (next.type === "el" && next.cond && next.cond.src === src && next.cond.key === key) {
          group.push(next)
          j++
          continue
        }
        break
      }
      // Выбираем первый удовлетворяющий
      let chosen: ElementSchema | null = null
      for (const el of group) {
        if (evaluateCondition(state, el.cond!, context, core)) {
          chosen = el
          break
        }
      }
      if (!chosen && group.length > 0) chosen = group[0]!
      if (chosen) result.push(chosen)
      // перескакиваем всю группу
      i = j
      continue
    }
    // Обычный элемент или текст добавляем как есть
    result.push(item)
    i++
  }
  return result
}
