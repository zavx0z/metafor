/**
 * Типы для реализации контекста
 * @packageDocumentation
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
    : never
  
  export type ExtractValues<S extends ContextSchema> = { [K in keyof S]: ExtractValue<S[K]> }
  export type UpdateValues<T> = { [K in keyof T]?: T[K] }
  
  // Тип для сериализованной схемы
  export type SerializedSchema<T extends ContextSchema> = {
    [K in keyof T]: {
      type: T[K]["type"]
      required: T[K]["required"]
      default: T[K]["default"]
      title?: T[K]["title"]
      values?: T[K] extends { values: any } ? T[K]["values"] : never
    }
  }
  
  export type JsonPatch =
    | { op: "replace"; path: string; value: any }
    | { op: "add"; path: string; value: any }
    | { op: "remove"; path: string }
  
  export interface ContextInstance<T extends ContextSchema> {
    /** Схема контекста (только для чтения) */
    schema: SerializedSchema<T>
    /** Текущее состояние контекста (только для чтения) */
    context: ExtractValues<T> & { _title: Record<keyof T, string> }
    /** Обновляет значения в контексте */
    update: (values: UpdateValues<ExtractValues<T>>) => Partial<ExtractValues<T>>
    /** Подписка на обновления контекста */
    onUpdate: (cb: (patches: JsonPatch[]) => void) => () => void
  }
  