/**
 * Глобальный реестр полей (Singleton).
 *
 * Регистрирует поля из схемы и присваивает им уникальные числовые ID для использования в байт-коде.
 *
 * ## Архитектура
 *
 * - **Fields (поля)** — общие для всех бран: схема типов для GPU
 * - Каждое поле получает уникальный `fieldId` (0, 1, 2...)
 * - Реестр очищается перед каждой инициализацией {@link Boundary}
 *
 * @example
 * ```ts
 * // Регистрация полей из схемы
 * const registry = FieldRegistry.getInstance()
 * registry.register('hp', FieldType.F32)
 * registry.register('name', FieldType.STRING_PTR)
 * const fieldId = registry.getId('hp') // 0
 * ```
 */

export const FieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
  SHARED_PTR: 5,
} as const

export type FieldTypeValue = typeof FieldType[keyof typeof FieldType]

export interface Field {
  name: string
  fieldId: number
  type: FieldTypeValue
  /** Для ARRAY_PTR: тип элементов ('string' | 'number'). */
  elementType?: string
  /** Для enum: массив допустимых значений. */
  enumValues?: any[]
}

export class FieldRegistry {
  private static instance: FieldRegistry | null = null
  private nameToField: Map<string, Field> = new Map()
  private idToField: Map<number, Field> = new Map()
  private nextId: number = 0

  private constructor() {}

  static getInstance(): FieldRegistry {
    if (!FieldRegistry.instance) {
      FieldRegistry.instance = new FieldRegistry()
    }
    return FieldRegistry.instance
  }

  /** Очищает реестр полностью (для тестов). */
  static clear(): void {
    if (!FieldRegistry.instance) {
      return
    }
    FieldRegistry.instance.nameToField.clear()
    FieldRegistry.instance.idToField.clear()
    FieldRegistry.instance.nextId = 0
  }

  /**
   * Регистрирует поле из схемы.
   *
   * @param name - Уникальное имя поля.
   * @param type - Тип данных из схемы (FieldType.F32, FieldType.BOOL, etc.).
   * @param options.elementType - Для массивов: тип элементов.
   * @param options.enumValues - Для enum: допустимые значения.
   *
   * @returns Присвоенный числовой ID.
   *
   * @throws {Error} Если поле уже зарегистрировано.
   */
  register(name: string, type: FieldTypeValue, options: { elementType?: string; enumValues?: any[] } = {}): number {
    if (this.nameToField.has(name)) {
      throw new Error(`Field '${name}' already registered`)
    }
    const fieldId = this.nextId++
    const field: Field = {
      fieldId,
      type,
      name,
      ...(options.elementType !== undefined ? { elementType: options.elementType } : {}),
      ...(options.enumValues !== undefined ? { enumValues: options.enumValues } : {}),
    }
    this.nameToField.set(name, field)
    this.idToField.set(fieldId, field)
    return fieldId
  }

  getField(name: string): Field | undefined {
    return this.nameToField.get(name)
  }

  getId(name: string): number {
    return this.nameToField.get(name)?.fieldId ?? -1
  }

  has(name: string): boolean {
    return this.nameToField.has(name)
  }

  getAll(): Field[] {
    return Array.from(this.idToField.values())
  }
}
