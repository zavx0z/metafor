type MetaLike = Record<string, any> & {
  context?: Record<string, any>
  states?: Record<string, any>
  processes?: Record<string, any>
  reactions?: Record<string, any>
}

/**
 * Формат JSON для monad.
 * Содержит все необходимые данные для инициализации monad и boundary.
 */
export interface MonadJson {
  name: string
  fields: Record<string, any>
  superposition: Record<string, any>
  processes?: Record<string, any>
  reactions?: Record<string, any>
}

type ArrayElementType = "string" | "number"

function inferArrayElementTypeFromDefault(value: unknown): ArrayElementType | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const sample = value.find((v) => v !== undefined && v !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
  return undefined
}

/**
 * Извлекает из исходного кода типы элементов для массивов, объявленных через t.array.required<Type>(...).
 */
export function extractArrayElementTypesFromSource(sourceText: string): Record<string, ArrayElementType> {
  const result: Record<string, ArrayElementType> = {}
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*t\s*\.\s*array\s*\.\s*(?:required|optional)\s*<\s*(string|number)\s*>\s*\(/g

  for (const match of sourceText.matchAll(re)) {
    const fieldName = match[1]
    const elementType = match[2] as ArrayElementType
    if (fieldName) result[fieldName] = elementType
  }
  return result
}

function inferEnumValueType(values: unknown): "string" | "number" | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined
  const sample = values.find((v) => v !== undefined && v !== null)
  if (typeof sample === "string") return "string"
  if (typeof sample === "number") return "number"
  return undefined
}

/**
 * Преобразует meta в формат JSON для monad.
 * 
 * @param meta - Исходный объект мета
 * @param sourceText - Исходный код для извлечения generic-типов
 * @returns Объект в формате для monad
 */
export function convertMetaToMonadJson(meta: MetaLike, sourceText?: string): MonadJson {
  const inputContext = meta?.context
  if (!inputContext || typeof inputContext !== "object") {
    throw new Error("context не найден или не является объектом")
  }

  const arrayElementTypesFromSource = sourceText ? extractArrayElementTypesFromSource(sourceText) : {}
  const fields: Record<string, any> = {}

  // Преобразуем context → fields, обогащая типы массивов и enum
  for (const [fieldName, rawDef] of Object.entries(inputContext)) {
    if (!rawDef || typeof rawDef !== "object") {
      fields[fieldName] = rawDef
      continue
    }

    const def = rawDef as Record<string, any>
    const type = def.type

    if (type === "array") {
      const fromDefault = inferArrayElementTypeFromDefault(def.default)
      const fromSource = arrayElementTypesFromSource[fieldName]
      const elementType = fromDefault ?? fromSource

      if (!elementType) {
        throw new Error(
          `Не удалось вывести тип элементов массива для компоненты '${fieldName}'. ` +
            `Добавь generic: t.array.required<number>([]) / t.array.required<string>([]) или задай непустой default.`,
        )
      }

      fields[fieldName] = { ...def, type: `array<${elementType}>` }
      continue
    }

    if (type === "enum") {
      const values = def.values
      const valueType = inferEnumValueType(values)

      if (!valueType) {
        throw new Error(`Не удалось вывести тип значений enum для компоненты '${fieldName}'. values должен быть string[] или number[].`)
      }

      fields[fieldName] = { ...def, type: `enum<${valueType}>` }
      continue
    }

    // Простые типы
    fields[fieldName] = def
  }

  // Строим superposition из states
  const superposition = meta.states || {}

  // Возвращаем формат для monad
  return {
    name: meta.name,
    fields,
    superposition,
    ...(meta.processes ? { processes: meta.processes } : {}),
    ...(meta.reactions ? { reactions: meta.reactions } : {}),
  }
}
