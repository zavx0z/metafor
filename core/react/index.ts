/**
 * Реализация реакций
 * @module Reactions
 */
import type { Schema, Update, Values } from "@zavx0z/context"
import type { ActorInfo, Core, JsonPatch } from "../index.t"
import type { ReactionParams } from "./index.t"
import type { ReactionUpdate, ReactionsSchema } from "../../schema/reactions.t"
import type { ReactionFilterConditions } from "./condition.t"

/**
 * Десериализует реакции из snapshot и возвращает объект с функциями для работы с реакциями.
 *
 * @param snapshot - сериализованный снимок реакций
 * @returns объект с функциями для работы с реакциями
 *
 * @example
 * ```ts
 * const reactions = deserializeReactions(snapshot)
 * if (reactions.hasReactions()) {
 *   reactions.run({
 *     context,
 *     core,
 *     meta: message.meta,
 *     actor: message.actor,
 *     timestamp: message.timestamp,
 *     patch,
 *     state,
 *     update
 *   })
 * }
 * ```
 */
export function deserializeReactions<C extends Schema, S extends string, I extends Core = {}>(
  snapshot: ReactionsSchema
): {
  run: (params: {
    state: S
    context: Values<C>
    core: I
    meta: string
    actor: ActorInfo
    timestamp: number
    patch: JsonPatch
    update: Update<C>
  }) => void
  hasReactions: () => boolean
  getAllReactions: () => Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
  }>
  getReactions: (state: S) => Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
  }>
} {
  const reactions: Array<{
    title: string
    description?: string
    update: ReactionUpdate<C, S, I>
    filter: (params: ReactionParams) => boolean
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

      // Для объектов и других типов - прямое сравнение
      if (typeof condition === "object" && condition !== null) {
        // Если это объект условий, но не подходящий тип - возвращаем false
        if (condition.eq !== undefined || condition.gt !== undefined || condition.startsWith !== undefined) {
          return false
        }
      }

      // Прямое сравнение для объектов и других типов
      return JSON.stringify(value) === JSON.stringify(condition)
    }
    return ({ meta, actor, timestamp, patch }: ReactionParams): boolean => {
      // Проверяем условия для метаданных
      if (conditions.meta !== undefined && !checkCondition.string(meta, conditions.meta)) return false
      if (conditions.index !== undefined && !checkCondition.number(actor.index, conditions.index)) return false
      if (conditions.timestamp !== undefined && !checkCondition.number(timestamp, conditions.timestamp)) return false
      // Проверяем условия для патча
      if (conditions.op !== undefined && patch.op !== conditions.op) return false
      if (conditions.path !== undefined && patch.path !== conditions.path) return false
      if (conditions.value !== undefined && !checkValueCondition(patch.value, conditions.value)) return false
      return true
    }
  }

  // Восстанавливаем реакции из snapshot
  for (const [reactionId, reactionData] of Object.entries(snapshot.reactions)) {
    if (reactionData && typeof reactionData === "object") {
      // Восстанавливаем функцию equal из строки
      const updateFn = new Function("return " + reactionData.src)() as ReactionUpdate<C, S, I>

      // Создаем функцию фильтра на основе условий
      const filterFn = createFilterFn(reactionData.cond)

      const reaction = {
        title: reactionData.title,
        ...(reactionData.desc && { description: reactionData.desc }),
        update: updateFn,
        filter: filterFn,
        states: [] as string[],
      }

      reactions.push(reaction)

      // Связываем реакции с состояниями
      for (const [state, reactionIds] of Object.entries(snapshot.states)) {
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
      for (const reaction of reactions) {
        // Проверяем, что реакция активна для текущего состояния
        if (!reaction.states.includes(params.state)) continue

        // Проверяем фильтр
        if (
          reaction.filter({
            meta: params.meta,
            actor: params.actor,
            timestamp: params.timestamp,
            patch: params.patch,
          })
        ) {
          // Выполняем реакцию
          reaction.update({
            update: params.update,
            context: params.context,
            core: params.core,
            meta: params.meta,
            actor: params.actor,
            timestamp: params.timestamp,
            patch: params.patch,
            state: params.state,
          })
        }
      }
    },
    hasReactions: () => reactions.length > 0,
    getAllReactions: () => reactions.map(({ states, ...reaction }) => reaction),
    getReactions: (state: S) => {
      return reactions
        .filter((reaction) => reaction.states.includes(state as string))
        .map(({ states, ...reaction }) => reaction)
    },
  }
}
