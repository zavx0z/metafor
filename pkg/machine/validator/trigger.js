/**
 * Типы условий для разных типов данных
 * @typedef {Object} ConditionKeys
 * @property {Set<string>} string - Ключи для строковых условий
 * @property {Set<string>} number - Ключи для числовых условий
 * @property {Set<string>} boolean - Ключи для логических условий
 * @property {Set<string>} enum - Ключи для enum условий
 * @property {Set<string>} array - Ключи для условий массивов
 */

/** @type {ConditionKeys} */
const CONDITIONS = {
  string: new Set(["startsWith", "endsWith", "include", "pattern", "not", "eq", "notEq", "notInclude", "notStartsWith", "notEndsWith", "isNull", "between", "length"]),
  number: new Set(["isNull", "eq", "gt", "gte", "lt", "lte", "notEq", "notGt", "notGte", "notLt", "notLte", "between"]),
  boolean: new Set(["eq", "notEq", "isNull", "logicalEq", "notNull"]),
  enum: new Set(["isNull", "eq", "notEq", "oneOf", "notOneOf"]),
  array: new Set(["isNull", "length", "includes"])
}

/**
 * Валидирует все триггеры в коллапсах
 * @param {Object} params Параметры валидации
 * @param {import('../types/index.ts').Collapses<any, any>} params.collapses Массив коллапсов
 * @param {Record<string, import('../types/index.ts').TypeDefinition>} params.contextDefinition Определение контекста
 * @throws {Error} Если найдены некорректные триггеры
 */
export function validateTriggers({collapses, contextDefinition}) {
  collapses.forEach(collapse => {
    collapse.to.forEach(transition => {
      if (!transition.trigger) return

      if (Object.keys(transition.trigger).length === 0) {
        throw new Error(`Пустой триггер в переходе из состояния "${collapse.from}" в "${transition.state}". Триггер должен содержать хотя бы одно условие.`)
      }

      Object.entries(transition.trigger).forEach(([field, condition]) => {
        const fieldDef = contextDefinition[field]
        if (!fieldDef) throw new Error(`Поле "${field}" не найдено в определении контекста для триггера ${collapse.from}`)

        validateTrigger(field, fieldDef, condition)

        if (typeof condition === "object" && condition !== null) {
          const conditionKeys = Object.keys(condition)
          if (conditionKeys.length === 0) throw new Error(`Пустое условие в триггере /${collapse.from}/${field}/trigger`)

          const allowedKeys = CONDITIONS[fieldDef.type]
          const invalidKeys = conditionKeys.filter(key => !allowedKeys.has(key))

          if (invalidKeys.length > 0)
            throw new Error(`Недопустимые ключи условия [${invalidKeys.join(", ")}] для типа "${fieldDef.type}" в триггере /${collapse.from}/${field}/trigger. Допустимые ключи: ${Array.from(allowedKeys).join(", ")}`)
        }
      })
    })
  })
}

/**
 * Проверяет тип значения
 * @param {any} value Значение для проверки
 * @param {string} expectedType Ожидаемый тип
 * @returns {boolean} Результат проверки
 */
function isType(value, expectedType) {
  if (expectedType === "array") return Array.isArray(value)
  if (expectedType === "object") return typeof value === "object" && value !== null && !Array.isArray(value)
  return typeof value === expectedType
}

/**
 * Проверяет корректность триггера
 * @param {string} field Название поля
 * @param {import('../types/index.ts').TypeDefinition} definition Тип поля
 * @param {any} value Значение триггера
 * @throws {Error} Если триггер некорректен
 */
function validateTrigger(field, definition, value) {
  /** @type {Record<string, Function>} */
  const validators = {
    string: validateStringTrigger,
    number: validateNumberTrigger,
    boolean: validateBooleanTrigger,
    enum: validateEnumTrigger,
    array: validateArrayTrigger
  }

  const validator = validators[definition.type]
  //@ts-ignore
  if (validator) {
    if (value === null && !definition.nullable) {
      throw new Error(`Поле "${field}" не может быть null, так как оно не является nullable.`)
    }
    //@ts-ignore
    validator(field, value, definition)
  } else {
    throw new Error(`Неизвестный тип поля "${definition.type}" в триггере ${field}`)
  }
}

/**
 * Проверяет корректность триггера для строкового поля
 * @param {string} field - Название поля
 * @param {any} value - Значение триггера
 * @param {import('../types/index.ts').TypeDefinition} definition - Определение типа
 * @throws {Error} Если триггер некорректен
 */
function validateStringTrigger(field, value, definition) {
  if (value === null) {
    if (!definition.nullable) {
      throw new Error(`Поле "${field}" не может быть null, так как оно не является nullable`)
    }
    return
  }

  if (typeof value === "string" || value instanceof RegExp) return

  if (isType(value, "object")) {
    const allowedKeys = CONDITIONS.string
    const keys = Object.keys(value)
    const hasValidKey = keys.some(key => allowedKeys.has(key))

    if (hasValidKey) return
  }

  throw new Error(
    `Некорректный триггер для строкового поля "${field}". Ожидается строка, регулярное выражение или объект с ключами ${Array.from(CONDITIONS.string)
      .map(key => `"${key}"`)
      .join(", ")}. Получено: ${JSON.stringify(value)}`
  )
}

/**
 * Проверяет корректность триггера для числового поля
 * @param {string} field - Название поля
 * @param {any} value - Значение триггера
 * @param {import('../types').TypeDefinition} definition - Определение типа
 * @throws {Error} Если триггер некорректен
 */
function validateNumberTrigger(field, value, definition) {
  if (value === null && definition.nullable) return
  if (isType(value, "number")) return
  if (isType(value, "object")) {
    const allowedKeys = CONDITIONS.number
    const keys = Object.keys(value)
    const hasValidKey = keys.some(key => allowedKeys.has(key))

    if (hasValidKey) return
  }
  throw new Error(
    `Некорректный триггер для числового поля "${field}". Ожидается число или объект с ключами ${Array.from(CONDITIONS.number)
      .map(key => `"${key}"`)
      .join(", ")}. Получено: ${JSON.stringify(value)}`
  )
}

/**
 * Проверяет корректность триггера для булевого поля
 * @param {string} field - Название поля
 * @param {any} value - Значение триггера
 * @param {import('../types').TypeDefinition} definition - Определение типа
 * @throws {Error} Если триггер некорректен
 */
function validateBooleanTrigger(field, value, definition) {
  if (value === null) {
    if (!definition.nullable) {
      throw new Error(`Поле "${field}" не может быть null, так как оно не является nullable`)
    }
    return
  }

  if (isType(value, "boolean")) return
  if (isType(value, "object")) {
    const allowedKeys = CONDITIONS.boolean
    const keys = Object.keys(value)
    const hasValidKey = keys.some(key => allowedKeys.has(key))

    if (hasValidKey) return
  }
  throw new Error(
    `Некорректный триггер для булевого поля "${field}". Ожидается булево значение или объект с ключами ${Array.from(CONDITIONS.boolean)
      .map(key => `"${key}"`)
      .join(", ")}. Получено: ${JSON.stringify(value)}`
  )
}

/**
 * Проверяет корректность триггера для массива
 * @param {string} field - Название поля
 * @param {any} value - Значение триггера
 * @throws {Error} Если триггер некорректен
 */
function validateArrayTrigger(field, value) {
  if (Array.isArray(value)) return
  if (isType(value, "object")) {
    const allowedKeys = CONDITIONS.array
    const keys = Object.keys(value)
    const hasValidKey = keys.some(key => allowedKeys.has(key))

    if (hasValidKey) return
  }
  throw new Error(
    `Некорректный триггер для поля массива "${field}". Ожидается массив или объект с ключами ${Array.from(CONDITIONS.array)
      .map(key => `"${key}"`)
      .join(", ")}. Получено: ${JSON.stringify(value)}`
  )
}

/**
 * Проверяет корректность триггера для enum
 * @param {string} field - Название поля
 * @param {import('../types/index.ts').EnumDefinition<any>} definition - Тип поля
 * @param {any} value - Значение триггера
 * @throws {Error} Если триггер некорректен
 */
function validateEnumTrigger(field, value, definition) {
  if (value === null) {
    if (!definition.nullable) {
      throw new Error(`Поле "${field}" не может быть null, так как оно не является nullable`)
    }
    return
  }

  const {values} = definition
  if (typeof value === "string" || typeof value === "number") {
    if (!values?.includes(value)) {
      throw new Error(`Значение "${value}" не является допустимым для enum поля "${field}". Допустимые значения: [${values.join(", ")}].`)
    }
    return
  }

  if (isType(value, "object")) {
    const allowedKeys = CONDITIONS.enum
    const keys = Object.keys(value)
    const hasValidKey = keys.some(key => allowedKeys.has(key))

    if (hasValidKey) return
  }

  throw new Error(
    `Некорректный триггер для enum поля "${field}". Ожидается строка, число или объект с ключами ${Array.from(CONDITIONS.enum)
      .map(key => `"${key}"`)
      .join(", ")}. Получено: ${JSON.stringify(value)}`
  )
}
