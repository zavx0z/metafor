/**
 * @file Глобальный реестр полей браны.
 *
 * Синглтон, управляющий маппингом строковых имен компонент на их метаданные:
 * - fieldId: уникальный числовой идентификатор поля
 * - type: тип данных (U32, F32, StringPtr и т.д.)
 *
 * @packageDocumentation
 */

/**
 * Типы данных компонент браны для GPU.
 * Расширяет базовые типы из common.ts для поддержки указателей.
 */
export const FieldType = {
  /** 32-битное число с плавающей точкой */
  F32: 0,
  /** 32-битное беззнаковое целое */
  U32: 1,
  /** Булево значение */
  BOOL: 2,
  /** Указатель на строку (индекс в куче) */
  STRING_PTR: 3,
  /** Указатель на массив (индекс в куче) */
  ARRAY_PTR: 4,
  /** Указатель на разделяемый блок (запутанная брана) */
  SHARED_PTR: 5,
} as const

export type FieldTypeValue = typeof FieldType[keyof typeof FieldType]

/**
 * Метаданные компоненты браны.
 */
export interface FieldMeta {
  /** Строковое имя поля */
  name: string
  /** Уникальный числовой идентификатор поля */
  fieldId: number
  /** Тип данных */
  type: FieldTypeValue
  /** Тип элементов для массивов */
  elementType?: string
  /** Возможные значения enum (если применимо) */
  enumValues?: any[]
}

/**
 * Глобальный реестр компонент браны.
 *
 * Синглтон, управляющий маппингом строковых имен компонент на их метаданные.
 *
 * @example
 * ```ts
 * const registry = GlobalFieldRegistry.getInstance()
 * registry.register('hp', FieldType.F32)
 * registry.register('name', FieldType.STRING_PTR)
 *
 * const hpId = registry.getId('hp') // 0
 * const hpType = registry.getType(hpId) // FieldType.F32
 * ```
 */
export class GlobalFieldRegistry {
  private static instance: GlobalFieldRegistry | null = null

  /** Маппинг имя поля -> метаданные */
  private nameToMeta: Map<string, FieldMeta> = new Map()
  /** Маппинг fieldId -> метаданные */
  private idToMeta: Map<number, FieldMeta> = new Map()
  /** Счётчик для генерации уникальных ID */
  private nextId: number = 0

  private constructor() {}

  /**
   * Получить единственный экземпляр реестра.
   */
  static getInstance(): GlobalFieldRegistry {
    if (!GlobalFieldRegistry.instance) {
      GlobalFieldRegistry.instance = new GlobalFieldRegistry()
    }
    return GlobalFieldRegistry.instance
  }

  /**
   * Сбросить реестр (для тестов).
   * @internal
   */
  static reset(): void {
    if (GlobalFieldRegistry.instance && GlobalFieldRegistry.instance.nextId > 0) {
      throw new Error('Cannot reset registry after components have been registered')
    }
    GlobalFieldRegistry.instance = null
  }

  /**
   * Полностью очистить реестр компонент, включая уже зарегистрированные.
   * @internal
   */
  static clear(): void {
    if (!GlobalFieldRegistry.instance) {
      return
    }
    GlobalFieldRegistry.instance.nameToMeta.clear()
    GlobalFieldRegistry.instance.idToMeta.clear()
    GlobalFieldRegistry.instance.nextId = 0
  }

  /**
   * Зарегистрировать новую компоненту браны.
   *
   * @param name - Строковое имя компоненты (например, 'hp', 'name')
   * @param type - Тип компоненты
   * @returns ID зарегистрированной компоненты
   * @throws Error если компонента с таким именем уже зарегистрирована
   */
  register(name: string, type: FieldTypeValue, options: { elementType?: string; enumValues?: any[] } = {}): number {
    if (this.nameToMeta.has(name)) {
      throw new Error(`Компонента '${name}' уже зарегистрирована`)
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
   * Пакетная регистрация компонент.
   *
   * @param components - Объект {имя: тип}
   * @returns Объект {имя: fieldId}
   */
  registerBatch(components: Record<string, FieldTypeValue>): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [name, type] of Object.entries(components)) {
      result[name] = this.register(name, type)
    }
    return result
  }

  /**
   * Получить метаданные компоненты по имени.
   *
   * @param name - Имя компоненты
   * @returns Метаданные компоненты или undefined
   */
  getMeta(name: string): FieldMeta | undefined {
    return this.nameToMeta.get(name)
  }

  /**
   * Получить метаданные компоненты по ID.
   *
   * @param fieldId - ID поля
   * @returns Метаданные компоненты или undefined
   */
  getMetaById(fieldId: number): FieldMeta | undefined {
    return this.idToMeta.get(fieldId)
  }

  /**
   * Получить ID компоненты по имени.
   *
   * @param name - Имя компоненты
   * @returns ID компоненты или -1 если не найдено
   */
  getId(name: string): number {
    return this.nameToMeta.get(name)?.fieldId ?? -1
  }

  /**
   * Получить тип компоненты по имени.
   *
   * @param name - Имя компоненты
   * @returns Тип компоненты или -1 если не найдено
   */
  getTypeByName(name: string): FieldTypeValue | -1 {
    return this.nameToMeta.get(name)?.type ?? -1
  }

  /**
   * Получить тип компоненты по ID.
   *
   * @param fieldId - ID поля
   * @returns Тип компоненты или -1 если не найдено
   */
  getType(fieldId: number): FieldTypeValue | -1 {
    return this.idToMeta.get(fieldId)?.type ?? -1
  }

  /**
   * Проверить, зарегистрирована ли компонента.
   *
   * @param name - Имя компоненты
   */
  has(name: string): boolean {
    return this.nameToMeta.has(name)
  }

  /**
   * Получить все зарегистрированные компоненты.
   *
   * @returns Массив метаданных всех компонент
   */
  getAll(): FieldMeta[] {
    return Array.from(this.idToMeta.values())
  }

  /**
   * Получить количество зарегистрированных компонент.
   */
  get size(): number {
    return this.nameToMeta.size
  }
}
