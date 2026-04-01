/**
 * Описание одного поля схемы MetaFor.
 */
interface SchemaTypeBase<
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

export type SchemaType<
  N extends "string" | "number" | "boolean" | "array" | "enum",
  R extends boolean = false,
  D extends unknown = undefined,
  V extends readonly (string | number)[] | never = never,
> = [D] extends [undefined] ? SchemaTypeBase<N, R, V> & { default?: D } : SchemaTypeBase<N, R, V> & { default: D }

export type Schema = Record<
  string,
  | SchemaType<"string", true | false, undefined>
  | SchemaType<"string", true | false, string>
  | SchemaType<"boolean", true | false, undefined>
  | SchemaType<"boolean", true | false, boolean>
  | SchemaType<"number", true | false, undefined>
  | SchemaType<"number", true | false, number>
  | SchemaType<"array", true | false, undefined>
  | SchemaType<"array", true | false, (string | number | boolean)[]>
  | SchemaType<"enum", true | false, undefined, readonly (string | number)[]>
  | SchemaType<"enum", true | false, string | number, readonly (string | number)[]>
>

export type ExtractValue<E> = E extends SchemaType<infer N, infer R, infer D, infer V>
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

export type Values<ɸ extends Schema> = { [K in keyof ɸ]: ExtractValue<ɸ[K]> }

export type Update<ɸ extends Schema> = (values: Partial<Values<ɸ>>) => Partial<Values<ɸ>>

export type Types = {
  string: TypePrimitive<string, "string">
  number: TypePrimitive<number, "number">
  boolean: TypePrimitive<boolean, "boolean">
  array: TypeArray
  enum: TypeEnum
}

export interface TypePrimitive<T extends string | number | boolean, N extends "string" | "number" | "boolean"> {
  optional(options?: { label?: string }): SchemaType<N, false>
  optional<D extends T>(defaultValue?: D, options?: { label?: string }): SchemaType<N, false, D>
  required: <D extends T>(defaultValue: D, options?: { label?: string; id?: true }) => SchemaType<N, true, D>
}

export type TypeArray = {
  optional: {
    (options?: { label?: string; data?: string }): SchemaType<"array", false>
    <D extends (string | number | boolean)[]>(
      defaultValue?: D,
      options?: { label?: string; data?: string },
    ): SchemaType<"array", false, D>
  }
  required: <D extends string | number | boolean>(
    defaultValue: D[],
    options?: { label?: string; data?: string },
  ) => SchemaType<"array", true, D[]>
}

export type TypeEnum = <const V extends readonly (string | number)[]>(...values: V) => {
  optional(options?: { label?: string }): SchemaType<"enum", false, undefined, V>
  optional<D extends V[number] | undefined>(defaultValue?: D, options?: { label?: string }): SchemaType<"enum", false, D, V>
  required: <D extends V[number]>(
    defaultValue: D,
    options?: { label?: string; id?: true },
  ) => SchemaType<"enum", true, D, V>
}
