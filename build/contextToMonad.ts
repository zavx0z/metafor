type MetaLike = Record<string, any> & { context?: Record<string, any> }

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
 * Используется для преобразования типа 'array' в 'array<string>' или 'array<number>' в промежуточном представлении.
 * @param sourceText - Исходный текст файла, в котором определен контекст.
 * @returns Объект, где ключ — имя поля массива, значение — тип элемента ('string' | 'number').
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
 * Преобразует объект мета-описания в промежуточный формат Monad, обогащая типы массивов и enum.
 * Для полей типа 'array' добавляет параметр типа (например, array<string>), выводя его из дефолтного значения или из generic в исходном коде.
 * Для полей типа 'enum' добавляет параметр типа (enum<string> или enum<number>).
 * @param meta - Исходный объект мета, полученный из default export.
 * @param sourceText - Исходный код файла, используется для извлечения generic-типов массивов.
 * @returns Новый объект с тем же набором полей, но с уточнёнными типами.
 * @throws Ошибка, если не удаётся вывести тип элементов массива или enum.
 */
export function convertMetaToMonadIntermediate(meta: MetaLike, sourceText?: string): MetaLike {
  const context = meta?.context
  if (!context || typeof context !== "object") return meta

  const arrayElementTypesFromSource = sourceText ? extractArrayElementTypesFromSource(sourceText) : {}
  const nextContext: Record<string, any> = {}

  for (const [fieldName, rawDef] of Object.entries(context)) {
    if (!rawDef || typeof rawDef !== "object") {
      nextContext[fieldName] = rawDef
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
          `Не удалось вывести тип элементов массива для поля '${fieldName}'. ` +
            `Добавь generic: t.array.required<number>([]) / t.array.required<string>([]) или задай непустой default.`,
        )
      }

      nextContext[fieldName] = { ...def, type: `array<${elementType}>` }
      continue
    }

    if (type === "enum") {
      const values = def.values
      const valueType = inferEnumValueType(values)

      if (!valueType) {
        throw new Error(`Не удалось вывести тип значений enum для поля '${fieldName}'. values должен быть string[] или number[].`)
      }

      const nextDef: Record<string, any> = { ...def, type: `enum<${valueType}>`, values }
      if ("enum" in nextDef) delete nextDef.enum
      nextContext[fieldName] = nextDef
      continue
    }

    nextContext[fieldName] = def
  }

  return { ...meta, context: nextContext }
}
