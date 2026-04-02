import type { Fields, Field } from "./fields.t"

function createPrimitiveType<TName extends "string" | "number" | "boolean">(type: TName) {
  return {
    optional<D>(defaultOrOptions?: D | { label?: string }, maybeOptions?: { label?: string }) {
      const hasDefault = defaultOrOptions !== undefined && typeof defaultOrOptions !== "object"
      const options = (hasDefault ? maybeOptions : (defaultOrOptions as { label?: string })) || {}
      const base: any = { type }
      if (hasDefault) base.default = defaultOrOptions
      if (options.label !== undefined) base.label = options.label
      return base
    },
    required<D>(defaultValue: D, options: { label?: string; id?: true } = {}) {
      const base: any = { type, required: true as const, default: defaultValue }
      if (options.label !== undefined) base.label = options.label
      if (options.id === true) base.id = true
      return base
    },
    type,
  }
}

const createArrayType = {
  optional<T extends string | number | boolean>(
    defaultOrOptions?: T[] | { label?: string; data?: string },
    maybeOptions?: { label?: string; data?: string },
  ) {
    const isDefaultArray = Array.isArray(defaultOrOptions)
    const options = (isDefaultArray ? maybeOptions : (defaultOrOptions as { label?: string; data?: string })) || {}
    const base: any = { type: "array" as const }
    if (isDefaultArray) base.default = defaultOrOptions
    if (options.label !== undefined) base.label = options.label
    if (typeof options.data === "string" && options.data.length > 0) base.data = options.data
    return base
  },
  required<T extends string | number | boolean>(defaultValue: T[], options: { label?: string; data?: string } = {}) {
    const base: any = { type: "array" as const, required: true, default: defaultValue }
    if (options.label !== undefined) base.label = options.label
    if (typeof options.data === "string" && options.data.length > 0) base.data = options.data
    return base
  },
}

const createEnumType = <const T extends readonly (string | number)[]>(...values: T) => ({
  optional(defaultOrOptions?: T[number] | { label?: string }, maybeOptions?: { label?: string }) {
    const hasDefault = defaultOrOptions !== undefined && typeof defaultOrOptions !== "object"
    const options = (hasDefault ? maybeOptions : (defaultOrOptions as { label?: string })) || {}
    const base: any = { type: "enum" as const, values }
    if (hasDefault) base.default = defaultOrOptions
    if (options.label !== undefined) base.label = options.label
    return base
  },
  required(defaultValue: T[number], options: { label?: string; id?: true } = {}) {
    const base: any = { type: "enum" as const, required: true, default: defaultValue, values }
    if (options.label !== undefined) base.label = options.label
    if (options.id === true) base.id = true
    return base
  },
})

export const field = {
  string: createPrimitiveType("string"),
  number: createPrimitiveType("number"),
  boolean: createPrimitiveType("boolean"),
  array: createArrayType,
  enum: Object.assign(
    <const T extends readonly (string | number)[]>(...values: T) => {
      const enumBase = createEnumType(...values)
      return Object.assign(
        (defaultValue?: T[number], options?: { label?: string }) => enumBase.optional(defaultValue, options),
        enumBase,
        { type: "enum" },
      )
    },
    { type: "enum" },
  ),
} satisfies Field

/**
 * Создаёт нормализованную схему полей MetaFor.
 */
export function fieldSchema<ɸ extends Fields>(schema: (field: Field) => ɸ): ɸ {
  const raw = schema(field)
  const out = {} as ɸ
  for (const key in raw) {
    const def = raw[key]
    if (!def) continue
    if (def.required && def.default === undefined) {
      throw new Error(`Обязательное поле ${key} должно иметь значение по умолчанию`)
    }
    const core: Record<string, unknown> = { type: def.type, ...(def.required && { required: true as const }) }
    if ("default" in def && def.default !== undefined) (core as any).default = def.default
    if ("label" in def && def.label !== undefined) (core as any).label = def.label
    if ("values" in def && Array.isArray((def as any).values) && (def as any).values.length > 0) {
      ;(core as any).values = (def as any).values
    }
    if ("id" in def && (def as any).id === true) (core as any).id = true
    if ("data" in def && typeof (def as any).data === "string" && (def as any).data.length > 0) {
      ;(core as any).data = (def as any).data
    }
    ;(out as any)[key] = core as unknown as ɸ[typeof key]
  }
  return out
}
