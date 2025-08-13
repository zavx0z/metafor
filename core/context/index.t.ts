/**
 * Типы для реализации контекста
 * @packageDocumentation
 * @module Context
 */

import type {
  ContextSchema,
  RequiredStringDefinition,
  OptionalStringDefinition,
  RequiredNumberDefinition,
  OptionalNumberDefinition,
  RequiredBooleanDefinition,
  OptionalBooleanDefinition,
  RequiredArrayDefinition,
  OptionalArrayDefinition,
  RequiredEnumDefinition,
  OptionalEnumDefinition,
} from "./types.t"

export * from "./types.t"

export type ExtractValue<T> = T extends RequiredStringDefinition
  ? string
  : T extends OptionalStringDefinition
    ? string | null
    : T extends RequiredNumberDefinition
      ? number
      : T extends OptionalNumberDefinition
        ? number | null
        : T extends RequiredBooleanDefinition
          ? boolean
          : T extends OptionalBooleanDefinition
            ? boolean | null
            : T extends RequiredArrayDefinition<infer U>
              ? U[]
              : T extends OptionalArrayDefinition<infer U>
                ? U[] | null
                : T extends RequiredEnumDefinition<infer U>
                  ? U[number]
                  : T extends OptionalEnumDefinition<infer U>
                    ? U[number] | null
                    : T extends { type: "array"; required: true; default?: number[] }
                      ? number[]
                      : T extends { type: "array"; required: true; default?: string[] }
                        ? string[]
                        : T extends { type: "array"; required: true; default?: boolean[] }
                          ? boolean[]
                          : never

export type ExtractValues<C extends ContextSchema> = { [K in keyof C]: ExtractValue<C[K]> }
export type UpdateValues<T> = { [K in keyof T]?: T[K] }

/**
 * Тип для снимка контекста
 * @template C - Схема контекста
 * @returns Снимок контекста
 */
export type ContextSnapshot<C extends ContextSchema> = {
  [K in keyof C]: {
    type: C[K]["type"]
    required: C[K]["required"]
    default: C[K]["default"]
    title?: C[K]["title"]
    values?: C[K] extends { values: any } ? C[K]["values"] : never
    value: ExtractValue<C[K]>
  }
}
// Тип для сериализованной схемы
export type SerializedSchema<T extends ContextSchema> = {
  [K in keyof T]: {
    type: T[K]["type"]
    required: T[K]["required"]
    default: T[K]["default"]
    title?: T[K]["title"]
    values: T[K] extends { values: any } ? T[K]["values"] : never
  }
}
/**
 * Тип для обновления значений в контексте
 * @template C - Схема контекста
 * @param values - Значения для обновления
 * @returns Значения, которые были обновлены
 *
 * @includeExample ./context/test/context.basic.spec.ts
 * @includeExample ./context/test/context.types.spec.ts
 */
export type Update<C extends ContextSchema> = (values: UpdateValues<ExtractValues<C>>) => Partial<ExtractValues<C>>

/**
 * Тип для подписки на обновления контекста
 * @template C - Схема контекста
 * @param cb - Функция, которая будет вызываться при обновлении контекста
 * @returns Функция для отписки от обновлений
 */
export type OnUpdate<C extends ContextSchema> = (cb: (updated: Partial<ExtractValues<C>>) => void) => () => void

/**
 * Интерфейс для экземпляра контекста
 * @template C - Схема контекста
 *
 * @includeExample ./context/test/context.basic.spec.ts
 * @includeExample ./context/test/context.metadata.spec.ts
 */
export interface ContextInstance<C extends ContextSchema> {
  /** Схема контекста (только для чтения) */
  schema: SerializedSchema<C>
  /** Текущее состояние контекста (только для чтения) */
  context: ExtractValues<C> & { _title: Record<keyof C, string> }
  /** Обновляет значения в контексте */
  update: Update<C>
  onUpdate: OnUpdate<C>
  /** Снимок контекста (только для чтения) */
  getSnapshot: () => ExtractValues<C>
}
