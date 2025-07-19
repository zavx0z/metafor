// Фабрики описаний типов параметров контекста

const createStringType = {
  required: (defaultValue?: string) => {
    const base = { type: "string" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  optional: (defaultValue?: string) => {
    const base = { type: "string" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

const createNumberType = {
  required: (defaultValue?: number) => {
    const base = { type: "number" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  optional: (defaultValue?: number) => {
    const base = { type: "number" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

const createBooleanType = {
  required: (defaultValue?: boolean) => {
    const base = { type: "boolean" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  optional: (defaultValue?: boolean) => {
    const base = { type: "boolean" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

const createArrayType = {
  required: (defaultValue?: any[]) => {
    const base = { type: "array" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  optional: (defaultValue?: any[]) => {
    const base = { type: "array" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

export const types = {
  string: Object.assign((defaultValue?: string) => createStringType.optional(defaultValue), createStringType),
  number: Object.assign((defaultValue?: number) => createNumberType.optional(defaultValue), createNumberType),
  boolean: Object.assign((defaultValue?: boolean) => createBooleanType.optional(defaultValue), createBooleanType),
  array: Object.assign((defaultValue?: any[]) => createArrayType.optional(defaultValue), createArrayType),
  enum: <const T extends readonly (string | number)[]>(...values: T) => {
    const enumBase = {
      required: (defaultValue?: T[number]) => {
        const base = { type: "enum" as const, required: true as const, values, default: defaultValue }
        const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
        return Object.assign(configurator, base)
      },
      optional: (defaultValue?: T[number]) => {
        const base = { type: "enum" as const, required: false as const, values, default: defaultValue }
        const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
        return Object.assign(configurator, base)
      },
    }
    return Object.assign((defaultValue?: T[number]) => enumBase.optional(defaultValue), enumBase)
  },
}
