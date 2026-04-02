/**
 * Описание одного поля схемы MetaFor.
 */
interface FieldTypeBase<
  N extends "string" | "number" | "boolean" | "array" | "enum",
  R extends boolean = false,
  V extends readonly (string | number)[] | never = never,
> {
  type: N
  required?: R
  label?: string
  values?: V
  id?: true
  data?: string
}

export type FieldType<
  N extends "string" | "number" | "boolean" | "array" | "enum",
  R extends boolean = false,
  D extends unknown = undefined,
  V extends readonly (string | number)[] | never = never,
> = [D] extends [undefined] ? FieldTypeBase<N, R, V> & { default?: D } : FieldTypeBase<N, R, V> & { default: D }

export type Fields = Record<
  string,
  | FieldType<"string", true | false, undefined>
  | FieldType<"string", true | false, string>
  | FieldType<"boolean", true | false, undefined>
  | FieldType<"boolean", true | false, boolean>
  | FieldType<"number", true | false, undefined>
  | FieldType<"number", true | false, number>
  | FieldType<"array", true | false, undefined>
  | FieldType<"array", true | false, (string | number | boolean)[]>
  | FieldType<"enum", true | false, undefined, readonly (string | number)[]>
  | FieldType<"enum", true | false, string | number, readonly (string | number)[]>
>

export type Value<E> = E extends FieldType<infer N, infer R, infer D, infer V>
  ? N extends "enum"
    ? R extends true
      ? V extends readonly (string | number)[]
        ? V[number]
        : D
      : (V extends readonly (string | number)[] ? V[number] : D) | null
    : N extends "array"
      ? R extends true
        ? D
        : D | null
      : N extends "string"
        ? R extends true
          ? string
          : string | null
        : N extends "number"
          ? R extends true
            ? number
            : number | null
          : N extends "boolean"
            ? R extends true
              ? boolean
              : boolean | null
            : never
  : never

export type Values<ɸ extends Fields> = { [K in keyof ɸ]: Value<ɸ[K]> }

export type Update<ɸ extends Fields> = (values: Partial<Values<ɸ>>) => Partial<Values<ɸ>>

export type Field = {
  string: FieldPrimitive<string, "string">
  number: FieldPrimitive<number, "number">
  boolean: FieldPrimitive<boolean, "boolean">
  array: FieldArray
  enum: FieldEnum
}

export interface FieldPrimitive<T extends string | number | boolean, N extends "string" | "number" | "boolean"> {
  optional(options?: { label?: string }): FieldType<N, false>

  optional<D extends T>(defaultValue?: D, options?: { label?: string }): FieldType<N, false, D>

  required: <D extends T>(defaultValue: D, options?: { label?: string; id?: true }) => FieldType<N, true, D>
}

export type FieldArray = {
  optional: {
    (options?: { label?: string; data?: string }): FieldType<"array", false>
    <D extends (string | number | boolean)[]>(
      defaultValue?: D,
      options?: { label?: string; data?: string },
    ): FieldType<"array", false, D>
  }
  required: <D extends string | number | boolean>(
    defaultValue: D[],
    options?: { label?: string; data?: string },
  ) => FieldType<"array", true, D[]>
}

export type FieldEnum = <const V extends readonly (string | number)[]>(...values: V) => {
  optional(options?: { label?: string }): FieldType<"enum", false, undefined, V>
  optional<D extends V[number] | undefined>(defaultValue?: D, options?: {
    label?: string
  }): FieldType<"enum", false, D, V>
  required: <D extends V[number]>(
    defaultValue: D,
    options?: { label?: string; id?: true },
  ) => FieldType<"enum", true, D, V>
}
