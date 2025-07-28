/**
 * Типы для фабрик типов и схем контекста
 *
 * # Контекст (Context)
 *
 * Контекст — это типизированное состояние компонента, которое автоматически обновляет UI при изменениях.
 * Контекст должен содержать только простые типы данных: строки, числа, булевы значения, массивы и перечисления.
 *
 * ## Основные принципы:
 * - **Простота**: Используйте только простые типы в контексте
 * - **ID в массивах**: Массивы должны содержать только ID объектов
 * - **Сложные объекты в Core**: Сложные данные храните в core
 *
 * ## Поддерживаемые типы:
 * - `string` — строки
 * - `number` — числа
 * - `boolean` — булевы значения
 * - `array` — массивы (рекомендуется хранить только ID)
 * - `enum` — перечисления
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
 */

/**
 * Базовое определение строкового типа
 * @property type - Тип поля ("string")
 * @property title - Опциональное название поля для документации
 * @property default - Значение по умолчанию
 */
export interface BaseStringDefinition {
  type: "string"
  title?: string
  default?: string | undefined
}

/**
 * Базовое определение числового типа
 * @property type - Тип поля ("number")
 * @property title - Опциональное название поля для документации
 * @property default - Значение по умолчанию
 */
export interface BaseNumberDefinition {
  type: "number"
  title?: string
  default?: number | undefined
}

/**
 * Базовое определение булевого типа
 * @property type - Тип поля ("boolean")
 * @property title - Опциональное название поля для документации
 * @property default - Значение по умолчанию
 */
export interface BaseBooleanDefinition {
  type: "boolean"
  title?: string
  default?: boolean | undefined
}

/**
 * Базовое определение типа массива
 * @template T - Тип элементов массива (string, number, boolean)
 * @property type - Тип поля ("array")
 * @property title - Опциональное название поля для документации
 * @property default - Значение по умолчанию (массив)
 *
 * @example
 * ```typescript
 * // Массив строк (ID пользователей)
 * userIds: types.array.required([])
 *
 * // Массив чисел (ID постов)
 * postIds: types.array.required([])
 * ```
 */
export interface BaseArrayDefinition<T extends string | number | boolean> {
  type: "array"
  title?: string
  default?: T[] | undefined
}

/**
 * Базовое определение типа перечисления
 * @template T - Массив допустимых значений
 * @property type - Тип поля ("enum")
 * @property values - Массив допустимых значений
 * @property title - Опциональное название поля для документации
 * @property default - Значение по умолчанию
 *
 * @example
 * ```typescript
 * // Перечисление статусов
 * status: types.enum.required(["pending", "active", "blocked"])
 *
 * // Перечисление ролей
 * role: types.enum.required(["user", "admin", "moderator"])
 * ```
 */
export interface BaseEnumDefinition<T extends readonly (string | number)[]> {
  type: "enum"
  values: T
  title?: string
  default?: T[number] | undefined
}

/**
 * Обязательное строковое поле
 * @example
 * ```typescript
 * name: types.string.required("Anonymous")
 * email: types.string.required("")
 * ```
 */
export interface RequiredStringDefinition extends BaseStringDefinition {
  required: true
}

/**
 * Обязательное числовое поле
 * @example
 * ```typescript
 * age: types.number.required(18)
 * count: types.number.required(0)
 * ```
 */
export interface RequiredNumberDefinition extends BaseNumberDefinition {
  required: true
}

/**
 * Обязательное булево поле
 * @example
 * ```typescript
 * isActive: types.boolean.required(false)
 * isLoading: types.boolean.required(false)
 * ```
 */
export interface RequiredBooleanDefinition extends BaseBooleanDefinition {
  required: true
}

/**
 * Обязательное поле массива
 * @template T - Тип элементов массива
 * @example
 * ```typescript
 * // Массив ID пользователей
 * userIds: types.array.required([])
 *
 * // Массив ID постов
 * postIds: types.array.required([])
 * ```
 */
export interface RequiredArrayDefinition<T extends string | number | boolean> extends BaseArrayDefinition<T> {
  required: true
}

/**
 * Обязательное поле перечисления
 * @template T - Массив допустимых значений
 * @example
 * ```typescript
 * status: types.enum.required(["pending", "active", "blocked"])
 * role: types.enum.required(["user", "admin"])
 * ```
 */
export interface RequiredEnumDefinition<T extends readonly (string | number)[]> extends BaseEnumDefinition<T> {
  required: true
}

/**
 * Опциональное строковое поле
 * @example
 * ```typescript
 * description: types.string.optional()
 * avatar: types.string.optional()
 * ```
 */
export interface OptionalStringDefinition extends BaseStringDefinition {
  required: false
}

/**
 * Опциональное числовое поле
 * @example
 * ```typescript
 * rating: types.number.optional()
 * priority: types.number.optional()
 * ```
 */
export interface OptionalNumberDefinition extends BaseNumberDefinition {
  required: false
}

/**
 * Опциональное булево поле
 * @example
 * ```typescript
 * isVerified: types.boolean.optional()
 * isPremium: types.boolean.optional()
 * ```
 */
export interface OptionalBooleanDefinition extends BaseBooleanDefinition {
  required: false
}

/**
 * Опциональное поле массива
 * @template T - Тип элементов массива
 * @example
 * ```typescript
 * tags: types.array.optional()
 * categories: types.array.optional()
 * ```
 */
export interface OptionalArrayDefinition<T extends string | number | boolean> extends BaseArrayDefinition<T> {
  required: false
}

/**
 * Опциональное поле перечисления
 * @template T - Массив допустимых значений
 * @example
 * ```typescript
 * theme: types.enum.optional(["light", "dark"])
 * language: types.enum.optional(["ru", "en"])
 * ```
 */
export interface OptionalEnumDefinition<T extends readonly (string | number)[]> extends BaseEnumDefinition<T> {
  required: false
}

/**
 * Объединенный тип для строковых определений
 */
export type StringDefinition = RequiredStringDefinition | OptionalStringDefinition

/**
 * Объединенный тип для числовых определений
 */
export type NumberDefinition = RequiredNumberDefinition | OptionalNumberDefinition

/**
 * Объединенный тип для булевых определений
 */
export type BooleanDefinition = RequiredBooleanDefinition | OptionalBooleanDefinition

/**
 * Объединенный тип для определений массивов
 * @template T - Тип элементов массива (по умолчанию string)
 */
export type ArrayDefinition<T extends string | number | boolean = string> =
  | RequiredArrayDefinition<T>
  | OptionalArrayDefinition<T>

/**
 * Объединенный тип для определений перечислений
 * @template T - Массив допустимых значений
 */
export type EnumDefinition<T extends readonly (string | number)[]> =
  | RequiredEnumDefinition<T>
  | OptionalEnumDefinition<T>

/**
 * Объединенный тип для всех возможных определений типов
 */
export type AnyDefinition =
  | StringDefinition
  | NumberDefinition
  | BooleanDefinition
  | ArrayDefinition<any>
  | EnumDefinition<any>

/**
 * Схема контекста - объект, где ключи - это имена полей, а значения - определения типов
 *
 * @example
 * ```typescript
 * const schema: ContextSchema = {
 *   name: { type: "string", required: true, default: "Anonymous" },
 *   age: { type: "number", required: true, default: 18 },
 *   isActive: { type: "boolean", required: true, default: false },
 *   userIds: { type: "array", required: true, default: [] },
 *   status: { type: "enum", required: true, values: ["pending", "active"], default: "pending" }
 * }
 * ```
 */
export type ContextSchema = Record<string, AnyDefinition>

/**
 * Фабрики типов для создания схем контекста
 *
 * ## Использование
 *
 * Фабрики типов предоставляют удобный API для создания определений типов:
 *
 * ```typescript
 * .context((types) => ({
 *   // Строки
 *   name: types.string.required("Anonymous"),
 *   email: types.string.optional(),
 *
 *   // Числа
 *   age: types.number.required(18),
 *   rating: types.number.optional(),
 *
 *   // Булевы значения
 *   isActive: types.boolean.required(false),
 *   isVerified: types.boolean.optional(),
 *
 *   // Массивы (рекомендуется хранить только ID)
 *   userIds: types.array.required([]),
 *   tags: types.array.optional(),
 *
 *   // Перечисления
 *   status: types.enum.required(["pending", "active", "blocked"]),
 *   role: types.enum.optional(["user", "admin"])
 * }))
 * ```
 *
 * ## Лучшие практики
 *
 * 1. **Используйте простые типы**: Контекст должен содержать только простые данные
 * 2. **Храните ID в массивах**: Вместо объектов храните их ID
 * 3. **Сложные объекты в Core**: Сложные данные размещайте в core
 * 4. **Осмысленные значения по умолчанию**: Задавайте разумные значения по умолчанию
 * 5. **Группируйте связанные поля**: Логически группируйте поля контекста
 *
 * @example
 * ```typescript
 * // ✅ Правильно - простые типы
 * .context((types) => ({
 *   userId: types.number.required(0),
 *   userName: types.string.required(""),
 *   userEmail: types.string.optional(),
 *   isLoggedIn: types.boolean.required(false)
 * }))
 *
 * // ❌ Неправильно - сложные объекты в контексте
 * .context((types) => ({
 *   user: types.object.required({ id: 1, name: "Admin" }) // Не делайте так!
 * }))
 * ```
 */
