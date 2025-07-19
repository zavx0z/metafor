/**
 * Типы для фабрик типов и схем контекста
 */

export interface BaseStringDefinition {
  type: "string"
  title?: string
  default?: string | undefined
}

export interface BaseNumberDefinition {
  type: "number"
  title?: string
  default?: number | undefined
}

export interface BaseBooleanDefinition {
  type: "boolean"
  title?: string
  default?: boolean | undefined
}

export interface BaseArrayDefinition<T extends string | number | boolean> {
  type: "array"
  title?: string
  default?: T[] | undefined
}

export interface BaseEnumDefinition<T extends readonly (string | number)[]> {
  type: "enum"
  values: T
  title?: string
  default?: T[number] | undefined
}

export interface RequiredStringDefinition extends BaseStringDefinition {
  required: true
}

export interface RequiredNumberDefinition extends BaseNumberDefinition {
  required: true
}

export interface RequiredBooleanDefinition extends BaseBooleanDefinition {
  required: true
}

export interface RequiredArrayDefinition<T extends string | number | boolean> extends BaseArrayDefinition<T> {
  required: true
}

export interface RequiredEnumDefinition<T extends readonly (string | number)[]> extends BaseEnumDefinition<T> {
  required: true
}

export interface OptionalStringDefinition extends BaseStringDefinition {
  required: false
}

export interface OptionalNumberDefinition extends BaseNumberDefinition {
  required: false
}

export interface OptionalBooleanDefinition extends BaseBooleanDefinition {
  required: false
}

export interface OptionalArrayDefinition<T extends string | number | boolean> extends BaseArrayDefinition<T> {
  required: false
}

export interface OptionalEnumDefinition<T extends readonly (string | number)[]> extends BaseEnumDefinition<T> {
  required: false
}

export type StringDefinition = RequiredStringDefinition | OptionalStringDefinition
export type NumberDefinition = RequiredNumberDefinition | OptionalNumberDefinition
export type BooleanDefinition = RequiredBooleanDefinition | OptionalBooleanDefinition

export type ArrayDefinition<T extends string | number | boolean = string> =
  | RequiredArrayDefinition<T>
  | OptionalArrayDefinition<T>

export type EnumDefinition<T extends readonly (string | number)[]> =
  | RequiredEnumDefinition<T>
  | OptionalEnumDefinition<T>

export type AnyDefinition =
  | StringDefinition
  | NumberDefinition
  | BooleanDefinition
  | ArrayDefinition<any>
  | EnumDefinition<any>

export type ContextSchema = Record<string, AnyDefinition>

// Новые типы для chainable API
export type ContextTypes = {
  string: {
    required: <T extends string = string>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => RequiredStringDefinition) & RequiredStringDefinition
    optional: <T extends string = string>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => OptionalStringDefinition) & OptionalStringDefinition
    <T extends string = string>(defaultValue?: T): ((options?: { title?: string }) => OptionalStringDefinition) &
      OptionalStringDefinition
  }
  number: {
    required: <T extends number = number>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => RequiredNumberDefinition) & RequiredNumberDefinition
    optional: <T extends number = number>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => OptionalNumberDefinition) & OptionalNumberDefinition
    <T extends number = number>(defaultValue?: T): ((options?: { title?: string }) => OptionalNumberDefinition) &
      OptionalNumberDefinition
  }
  boolean: {
    required: <T extends boolean = boolean>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => RequiredBooleanDefinition) & RequiredBooleanDefinition
    optional: <T extends boolean = boolean>(
      defaultValue?: T
    ) => ((options?: { title?: string }) => OptionalBooleanDefinition) & OptionalBooleanDefinition
    <T extends boolean = boolean>(defaultValue?: T): ((options?: { title?: string }) => OptionalBooleanDefinition) &
      OptionalBooleanDefinition
  }
  array: {
    required: <T extends string | number | boolean = string>(
      defaultValue?: T[]
    ) => ((options?: { title?: string }) => RequiredArrayDefinition<T>) & RequiredArrayDefinition<T>
    optional: <T extends string | number | boolean = string>(
      defaultValue?: T[]
    ) => ((options?: { title?: string }) => OptionalArrayDefinition<T>) & OptionalArrayDefinition<T>
    <T extends string | number | boolean = string>(defaultValue?: T[]): ((options?: {
      title?: string
    }) => OptionalArrayDefinition<T>) &
      OptionalArrayDefinition<T>
  }
  enum: <const T extends readonly (string | number)[]>(
    ...values: T
  ) => {
    required: (
      defaultValue?: T[number]
    ) => ((options?: { title?: string }) => RequiredEnumDefinition<T>) & RequiredEnumDefinition<T>
    optional: (
      defaultValue?: T[number]
    ) => ((options?: { title?: string }) => OptionalEnumDefinition<T>) & OptionalEnumDefinition<T>
    (defaultValue?: T[number]): ((options?: { title?: string }) => OptionalEnumDefinition<T>) &
      OptionalEnumDefinition<T>
  }
}
