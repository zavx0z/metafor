/**
 * Проверяет корректность поля контекста
 * @param {string} field - Название поля
 * @param {import('../types/index.ts').TypeDefinition} value - Значение поля
 * @throws {Error} Если поле не соответствует требованиям
 */
function validateContextField(field, value) {
  const RESERVED_KEYWORDS = ["state"]
  
  if (RESERVED_KEYWORDS.includes(field)) {
    throw new Error(`Поле "${field}" является зарезервированным ключевым словом`)
  }

  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error(`Поле "${field}" в контексте должно иметь объявленный тип`)
  }

  /** @type {readonly ['string', 'number', 'boolean', 'enum', 'array']} */
  const ALLOWED_TYPES = ["string", "number", "boolean", "enum", "array"]
  /** @typedef {'string' | 'number' | 'boolean' | 'enum'} AllowedType */

  if (!ALLOWED_TYPES.includes(/** @type {AllowedType} */ (value.type))) {
    throw new Error(`Неподдерживаемый тип "${value.type}" для поля "${field}". ` + `Поддерживаемые типы: ${ALLOWED_TYPES.join(", ")}`)
  }

  if (value.type === "enum") {
    if (!value.values || !Array.isArray(value.values) || value.values.length === 0) {
      throw new Error(`Enum поле "${field}" должно иметь непустой массив значений`)
    }
  }
}

/**
 * Проверяет корректность всего объекта контекста
 * @param {import('../types/index.ts').ContextDefinition} ctxDef - Объект контекста
 * @throws {Error} Если контекст не соответствует требованиям
 */
export function validateContextDefinition(ctxDef) {
  if (!ctxDef || typeof ctxDef !== "object") throw new Error("Контекст должен быть объектом")
  Object.entries(ctxDef).forEach(([field, value]) => validateContextField(field, value))
}
