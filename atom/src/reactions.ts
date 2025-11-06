/**
 * Реализация реакций
 * @module Reactions
 */
import type { Schema, Update, Values } from "@zavx0z/context"
import type { Core } from "../gravity.t"
import type { ReactionParams, Reactions } from "./reactions.t"
import type { ReactionAction, ReactionsSchema } from "../../meta/reactions.t"
import type { ReactionFilterConditions } from "./condition.t"
import type { Self } from "../../meta/metafor"
export type { Reactions } from "./reactions.t"

/**
 * Десериализует реакции из схемы и возвращает объект с функциями для работы с реакциями.
 *
 * @param schema - схема реакций
 * @returns объект с функциями для работы с реакциями
 *
 * @example
 * ```ts
 * const reactions = deserializeReactions(schema)
 * if (reactions.exists()) {
 *   reactions.run({
 *     context,
 *     core,
 *     meta: message.meta,
 *     atom: message.atom,
 *     timestamp: message.timestamp,
 *     patch,
 *     state,
 *     update
 *   })
 * }
 * ```
 */
export function reactionsFromSchema<C extends Schema = Schema, S extends string = string, I extends Core = Core>(
  schema: ReactionsSchema
): Reactions<C, S, I> {
  const reactions: Array<{
    label: string
    desc?: string
    update: ReactionAction<C, S, I>
    getConditions: (params: { self: Self; context: Values<C> }) => any
    states: string[]
  }> = []

  const stateToReactions: Record<string, string[]> = {}

  const checkCondition = {
    /**
     * Проверяет условие для строкового значения
     */
    string(value: string, condition: any): boolean {
      if (typeof condition === "string") {
        return value === condition
      }
      if (condition instanceof RegExp) {
        return condition.test(value)
      }
      if (typeof condition === "object" && condition !== null) {
        if (condition.eq !== undefined && value !== condition.eq) return false
        if (condition.notEq !== undefined && value === condition.notEq) return false
        if (condition.startsWith !== undefined && !value.startsWith(condition.startsWith)) return false
        if (condition.endsWith !== undefined && !value.endsWith(condition.endsWith)) return false
        if (condition.include !== undefined && !value.includes(condition.include)) return false
        if (condition.notInclude !== undefined && value.includes(condition.notInclude)) return false
        if (condition.notStartsWith !== undefined && value.startsWith(condition.notStartsWith)) return false
        if (condition.notEndsWith !== undefined && value.endsWith(condition.notEndsWith)) return false
        if (condition.pattern !== undefined && !condition.pattern.test(value)) return false
        if (condition.length !== undefined) {
          if (typeof condition.length === "number") {
            if (value.length !== condition.length) return false
          } else {
            if (condition.length.min !== undefined && value.length < condition.length.min) return false
            if (condition.length.max !== undefined && value.length > condition.length.max) return false
          }
        }
        if (condition.between !== undefined) {
          const [min, max] = condition.between
          if (value < min || value > max) return false
        }
        if (condition.in !== undefined && !condition.in.includes(value)) return false
        if (condition.notIn !== undefined && condition.notIn.includes(value)) return false
      }
      return true
    },
    /**
     * Проверяет условие для числового значения
     */
    number(value: number, condition: any): boolean {
      if (typeof condition === "number") {
        return value === condition
      }
      if (typeof condition === "object" && condition !== null) {
        if (condition.eq !== undefined && value !== condition.eq) return false
        if (condition.notEq !== undefined && value === condition.notEq) return false
        if (condition.gt !== undefined && value <= condition.gt) return false
        if (condition.gte !== undefined && value < condition.gte) return false
        if (condition.lt !== undefined && value >= condition.lt) return false
        if (condition.lte !== undefined && value > condition.lte) return false
        if (condition.notGt !== undefined && value > condition.notGt) return false
        if (condition.notGte !== undefined && value >= condition.notGte) return false
        if (condition.notLt !== undefined && value < condition.notLt) return false
        if (condition.notLte !== undefined && value <= condition.notLte) return false
        if (condition.between !== undefined) {
          const [min, max] = condition.between
          if (value < min || value > max) return false
        }
        if (condition.in !== undefined && !condition.in.includes(value)) return false
        if (condition.notIn !== undefined && condition.notIn.includes(value)) return false
      }
      return true
    },

    /**
     * Проверяет условие для булевого значения
     */
    boolean(value: boolean, condition: any): boolean {
      if (typeof condition === "boolean") {
        return value === condition
      }
      if (typeof condition === "object" && condition !== null) {
        if (condition.eq !== undefined && value !== condition.eq) return false
        if (condition.notEq !== undefined && value === condition.notEq) return false
        if (condition.logicalEq !== undefined && Boolean(value) !== condition.logicalEq) return false
      }
      return true
    },
    /**
     * Проверяет условие для массива
     */
    array(value: any[], condition: any): boolean {
      if (Array.isArray(condition)) {
        return JSON.stringify(value) === JSON.stringify(condition)
      }
      if (typeof condition === "object" && condition !== null) {
        if (condition.length !== undefined) {
          if (typeof condition.length === "number") {
            if (value.length !== condition.length) return false
          } else {
            if (condition.length.min !== undefined && value.length < condition.length.min) return false
            if (condition.length.max !== undefined && value.length > condition.length.max) return false
          }
        }
        if (condition.includes !== undefined && !value.includes(condition.includes)) return false
        if (condition.notIncludes !== undefined && value.includes(condition.notIncludes)) return false
        if (condition.isEmpty !== undefined && (condition.isEmpty ? value.length !== 0 : value.length === 0))
          return false
        if (condition.every !== undefined) {
          if (
            !value.every((item) => {
              if (typeof item === "number") return checkCondition.number(item, condition.every)
              if (typeof item === "string") return checkCondition.string(item, condition.every)
              return false
            })
          )
            return false
        }
        if (condition.some !== undefined) {
          if (
            !value.some((item) => {
              if (typeof item === "number") return checkCondition.number(item, condition.some)
              if (typeof item === "string") return checkCondition.string(item, condition.some)
              return false
            })
          )
            return false
        }
      }
      return true
    },
  }

  /**
   * Создает функцию фильтрации на основе декларативных условий
   */
  function createFilterFn(conditions: ReactionFilterConditions) {
    /**
     * Проверяет условие для любого значения
     */
    function checkValueCondition(value: any, condition: any): boolean {
      // Проверка на null
      if (condition === null) {
        return value === null
      }

      // Проверка на undefined
      if (condition === undefined) {
        return value === undefined
      }

      // Проверка на null в объекте условий
      if (typeof condition === "object" && condition !== null && condition.null !== undefined) {
        if (condition.null && value !== null) return false
        if (!condition.null && value === null) return false
        return true // Если проверка null прошла успешно, возвращаем true
      }

      // Для объектов - проверяем специальные условия (должно быть ДО проверки типов)
      if (typeof condition === "object" && condition !== null && condition.includeKey !== undefined) {
        // Если есть includeKey, но значение не объект - возвращаем false
        if (typeof value !== "object" || value === null) {
          return false
        }

        // Проверяем includeKey для объектов
        if (!(condition.includeKey in value)) return false

        // Если только includeKey - возвращаем true
        if (Object.keys(condition).length === 1) {
          return true
        }

        // Если есть другие условия вместе с includeKey - продолжаем проверку
        return true
      }

      // Проверка по типу значения
      if (typeof value === "string") {
        return checkCondition.string(value, condition)
      }
      if (typeof value === "number") {
        return checkCondition.number(value, condition)
      }
      if (typeof value === "boolean") {
        return checkCondition.boolean(value, condition)
      }
      if (Array.isArray(value)) {
        return checkCondition.array(value, condition)
      }

      // Прямое сравнение для объектов и других типов
      return JSON.stringify(value) === JSON.stringify(condition)
    }
    return ({ meta, atom: atom, timestamp, patch }: ReactionParams): boolean => {
      // Проверяем условия для метаданных
      if (conditions.meta !== undefined && !checkCondition.string(meta, conditions.meta)) return false
      if (conditions.atom !== undefined && !checkCondition.string(atom, conditions.atom)) return false
      if (conditions.timestamp !== undefined && !checkCondition.number(timestamp, conditions.timestamp)) return false
      // Проверяем условия для патча
      if (conditions.op !== undefined && patch.op !== conditions.op) return false
      if (conditions.path !== undefined && patch.path !== conditions.path) return false
      if (conditions.value !== undefined && !checkValueCondition(patch.value, conditions.value)) return false
      return true
    }
  }

  // Восстанавливаем реакции из snapshot
  for (const [reactionId, reactionData] of Object.entries(schema.reactions)) {
    if (reactionData && typeof reactionData === "object") {
      // Восстанавливаем функцию equal из строки

      // const paramString = "({ update, context, core, meta, atom, timestamp, patch, state, self }) => "

      const updateFn = new Function("return " + reactionData.src)() as ReactionAction<C, S, I>

      // Создаем функцию фильтра из строки
      const filterFn = new Function("return " + reactionData.cond)()

      const reaction = {
        label: reactionData.label,
        ...(reactionData.desc && { desc: reactionData.desc }),
        update: updateFn,
        getConditions: filterFn,
        states: [] as string[],
      }

      reactions.push(reaction)

      // Связываем реакции с состояниями
      for (const [state, reactionIds] of Object.entries(schema.states)) {
        if (reactionIds.includes(reactionId)) {
          reaction.states.push(state)
          if (!stateToReactions[state]) stateToReactions[state] = []
          stateToReactions[state].push(reactionId)
        }
      }
    }
  }

  return {
    run: (params) => {
      let anyEqual = false
      for (const reaction of reactions) {
        // Проверяем, что реакция активна для текущего состояния
        if (!reaction.states.includes(params.state)) continue

        // Получаем условия фильтра с передачей self и context
        const conditions = reaction.getConditions({
          self: params.self,
          context: params.context,
        })
        // Создаем фильтр на основе условий
        const filterFn = createFilterFn(conditions)
        // Проверяем фильтр
        if (
          filterFn({
            meta: params.meta,
            atom: params.atom,
            timestamp: params.timestamp,
            patch: params.patch,
            self: params.self,
          })
        ) {
          anyEqual = true
          reaction.update({
            update: params.update as Update<C>,
            context: params.context as Values<C>,
            core: params.core as I,
            meta: params.meta,
            atom: params.atom,
            timestamp: params.timestamp,
            patch: params.patch,
            state: params.state as S,
            self: params.self,
          })
        }
      }
      return anyEqual
    },
    exists: () => reactions.length > 0,
    getAll: () => reactions.map(({ states, ...reaction }) => reaction),
    get: (state: S) => {
      return reactions.filter((reaction) => reaction.states.includes(state)).map(({ states, ...reaction }) => reaction)
    },
  }
}
