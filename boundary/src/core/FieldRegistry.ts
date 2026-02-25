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

export interface FieldMeta {
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
  private nameToMeta: Map<string, FieldMeta> = new Map()
  private idToMeta: Map<number, FieldMeta> = new Map()
  private nextId: number = 0

  private constructor() {}

  static getInstance(): FieldRegistry {
    if (!FieldRegistry.instance) {
      FieldRegistry.instance = new FieldRegistry()
    }
    return FieldRegistry.instance
  }

  /**
   * Сбрасывает реестр (только если пуст).
   *
   * @throws {Error} Если уже есть зарегистрированные поля.
   */
  static reset(): void {
    if (FieldRegistry.instance && FieldRegistry.instance.nextId > 0) {
      throw new Error('Cannot reset registry after fields have been registered')
    }
    FieldRegistry.instance = null
  }

  /** Очищает реестр полностью (для тестов). */
  static clear(): void {
    if (!FieldRegistry.instance) {
      return
    }
    FieldRegistry.instance.nameToMeta.clear()
    FieldRegistry.instance.idToMeta.clear()
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
    if (this.nameToMeta.has(name)) {
      throw new Error(`Field '${name}' already registered`)
    }
    const fieldId = this.nextId++
    const meta: FieldMeta = {
      fieldId,
      type,
      name,
      ...(options.elementType !== undefined ? { elementType: options.elementType } : {}),
      ...(options.enumValues !== undefined ? { enumValues: options.enumValues } : {}),
    }
    this.nameToMeta.set(name, meta)
    this.idToMeta.set(fieldId, meta)
    return fieldId
  }

  /**
   * Регистрирует несколько полей из схемы.
   *
   * @param components - Схема полей: `{ name: type }`.
   * @returns Маппинг имён полей в их ID.
   */
  registerBatch(components: Record<string, FieldTypeValue>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [name, type] of Object.entries(components)) {
      result[name] = this.register(name, type)
    }
    return result
  }

  getMeta(name: string): FieldMeta | undefined {
    return this.nameToMeta.get(name)
  }

  getMetaById(fieldId: number): FieldMeta | undefined {
    return this.idToMeta.get(fieldId)
  }

  getId(name: string): number {
    return this.nameToMeta.get(name)?.fieldId ?? -1
  }

  getTypeByName(name: string): FieldTypeValue | -1 {
    return this.nameToMeta.get(name)?.type ?? -1
  }

  getType(fieldId: number): FieldTypeValue | -1 {
    return this.idToMeta.get(fieldId)?.type ?? -1
  }

  has(name: string): boolean {
    return this.nameToMeta.has(name)
  }

  getAll(): FieldMeta[] {
    return Array.from(this.idToMeta.values())
  }

  get size(): number {
    return this.nameToMeta.size
  }
}
