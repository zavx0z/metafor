// Фабрики описаний типов параметров контекста

/**
 * Создает строковый тип с поддержкой required/optional
 */
const createStringType = {
  /**
   * Создает обязательный строковый тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания строкового типа с опциями
   *
   * @example
   * ```typescript
   * name: types.string.required("Anonymous")
   * ```
   */
  required: (defaultValue?: string) => {
    const base = { type: "string" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  /**
   * Создает опциональный строковый тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания строкового типа с опциями
   *
   * @example
   * ```typescript
   * email: types.string.optional()
   * ```
   */
  optional: (defaultValue?: string) => {
    const base = { type: "string" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

/**
 * Создает числовой тип с поддержкой required/optional
 */
const createNumberType = {
  /**
   * Создает обязательный числовой тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания числового типа с опциями
   *
   * @example
   * ```typescript
   * age: types.number.required(18)
   * ```
   */
  required: (defaultValue?: number) => {
    const base = { type: "number" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  /**
   * Создает опциональный числовой тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания числового типа с опциями
   *
   * @example
   * ```typescript
   * score: types.number.optional()
   * ```
   */
  optional: (defaultValue?: number) => {
    const base = { type: "number" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

/**
 * Создает булевый тип с поддержкой required/optional
 */
const createBooleanType = {
  /**
   * Создает обязательный булевый тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания булевого типа с опциями
   *
   * @example
   * ```typescript
   * isActive: types.boolean.required(false)
   * ```
   */
  required: (defaultValue?: boolean) => {
    const base = { type: "boolean" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  /**
   * Создает опциональный булевый тип
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания булевого типа с опциями
   *
   * @example
   * ```typescript
   * isVerified: types.boolean.optional()
   * ```
   */
  optional: (defaultValue?: boolean) => {
    const base = { type: "boolean" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

/**
 * Создает тип массива с поддержкой required/optional
 */
const createArrayType = {
  /**
   * Создает обязательный тип массива
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания типа массива с опциями
   *
   * @example
   * ```typescript
   * userIds: types.array.required([])
   * ```
   */
  required: <T extends string | number | boolean = string>(defaultValue?: T[]) => {
    const base = { type: "array" as const, required: true as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
  /**
   * Создает опциональный тип массива
   * @param defaultValue - Значение по умолчанию
   * @returns Функция для создания типа массива с опциями
   *
   * @example
   * ```typescript
   * tags: types.array.optional()
   * ```
   */
  optional: <T extends string | number | boolean = string>(defaultValue?: T[]) => {
    const base = { type: "array" as const, required: false as const, default: defaultValue }
    const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
    return Object.assign(configurator, base)
  },
}

/**
 * Фабрика типов для создания схемы контекста
 *
 * Предоставляет методы для создания типизированных полей контекста:
 * - `string` - строковые значения
 * - `number` - числовые значения
 * - `boolean` - булевы значения
 * - `array` - массивы (рекомендуется хранить только ID)
 * - `enum` - перечисления
 *
 * Каждый тип поддерживает методы `.required()` и `.optional()` для указания обязательности поля.
 *
 * @example
 * ```typescript
 * .context((types) => ({
 *   // Обязательные поля
 *   name: types.string.required("Anonymous"),
 *   age: types.number.required(18),
 *   isActive: types.boolean.required(false),
 *
 *   // Опциональные поля
 *   email: types.string.optional(),
 *   avatar: types.string.optional(),
 *
 *   // Массивы (храним только ID)
 *   userIds: types.array.required([]),
 *
 *   // Enum
 *   status: types.enum.required(["pending", "active", "blocked"]),
 * }))
 * ```
 *
 * @includeExample ./context/test/context.basic.spec.ts
 * @includeExample ./context/test/context.types.spec.ts
 */
export const types = {
  /**
   * Создает строковый тип
   * @param defaultValue - Значение по умолчанию (создает optional тип)
   * @returns Объект с методами required() и optional()
   *
   * @example
   * ```typescript
   * // Обязательное поле
   * name: types.string.required("Anonymous")
   *
   * // Опциональное поле
   * email: types.string.optional()
   *
   * // С дефолтным значением
   * title: types.string("Default Title")
   * ```
   */
  string: Object.assign((defaultValue?: string) => createStringType.optional(defaultValue), createStringType),

  /**
   * Создает числовой тип
   * @param defaultValue - Значение по умолчанию (создает optional тип)
   * @returns Объект с методами required() и optional()
   *
   * @example
   * ```typescript
   * // Обязательное поле
   * age: types.number.required(18)
   *
   * // Опциональное поле
   * score: types.number.optional()
   *
   * // С дефолтным значением
   * count: types.number(0)
   * ```
   */
  number: Object.assign((defaultValue?: number) => createNumberType.optional(defaultValue), createNumberType),

  /**
   * Создает булевый тип
   * @param defaultValue - Значение по умолчанию (создает optional тип)
   * @returns Объект с методами required() и optional()
   *
   * @example
   * ```typescript
   * // Обязательное поле
   * isActive: types.boolean.required(false)
   *
   * // Опциональное поле
   * isVerified: types.boolean.optional()
   *
   * // С дефолтным значением
   * enabled: types.boolean(true)
   * ```
   */
  boolean: Object.assign((defaultValue?: boolean) => createBooleanType.optional(defaultValue), createBooleanType),

  /**
   * Создает тип массива
   * @param defaultValue - Значение по умолчанию (создает optional тип)
   * @returns Объект с методами required() и optional()
   *
   * @example
   * ```typescript
   * // Обязательное поле
   * userIds: types.array.required([])
   *
   * // Опциональное поле
   * tags: types.array.optional()
   *
   * // С дефолтным значением
   * items: types.array(["default"])
   * ```
   */
  array: Object.assign((defaultValue?: any[]) => createArrayType.optional(defaultValue), createArrayType),

  /**
   * Создает тип перечисления
   * @param values - Массив допустимых значений
   * @returns Функция с дефолтным значением или объект с методами required() и optional()
   *
   * @example
   * ```typescript
   * // Обязательное поле
   * status: types.enum("pending", "active", "blocked").required("pending")
   *
   * // Опциональное поле
   * theme: types.enum("light", "dark").optional()
   *
   * // С дефолтным значением
   * role: types.enum("user", "admin")("user")
   * ```
   */
  enum: <const T extends readonly (string | number)[]>(...values: T) => {
    const enumBase = {
      /**
       * Создает обязательный тип перечисления
       * @param defaultValue - Значение по умолчанию
       * @returns Функция для создания типа перечисления с опциями
       *
       * @example
       * ```typescript
       * status: types.enum("pending", "active", "blocked").required("pending")
       * ```
       */
      required: (defaultValue?: T[number]) => {
        const base = { type: "enum" as const, required: true as const, values, default: defaultValue }
        const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
        return Object.assign(configurator, base)
      },
      /**
       * Создает опциональный тип перечисления
       * @param defaultValue - Значение по умолчанию
       * @returns Функция для создания типа перечисления с опциями
       *
       * @example
       * ```typescript
       * theme: types.enum("light", "dark").optional()
       * ```
       */
      optional: (defaultValue?: T[number]) => {
        const base = { type: "enum" as const, required: false as const, values, default: defaultValue }
        const configurator = (options: { title?: string } = {}) => ({ ...base, ...options })
        return Object.assign(configurator, base)
      },
    }
    return Object.assign((defaultValue?: T[number]) => enumBase.optional(defaultValue), enumBase)
  },
}
