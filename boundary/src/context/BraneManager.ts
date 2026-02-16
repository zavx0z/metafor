/**
 * @file Менеджер бран.
 *
 * Высокоуровневый API для управления жизненным циклом полей и их бран.
 * Координирует работу GlobalFieldRegistry, HeapAllocator и BraneBuilder.
 *
 * @packageDocumentation
 */

import { GlobalFieldRegistry, FieldType, type FieldTypeValue } from "./GlobalFieldRegistry"
import { HeapAllocator } from "./HeapAllocator"
import { BraneBuilder, BlockUtils } from "./BraneBuilder"
import { getStringAtlas } from "../typeBridge"

/**
 * Информация о поле (Field) в границе.
 */
export interface FieldInfo {
  /** Уникальный идентификатор поля */
  id: number
  /** Указатель на блок в куче */
  blockPtr: number
  /** Размер блока в словах */
  blockSize: number
  /** Дополнительные аллокации (строки, массивы) */
  extraAllocs: { offset: number; size: number }[]
  /** Указатели на разделяемые блоки */
  sharedPtrs: number[]
}

/**
 * Информация о разделяемой (entangled) бране.
 * Запутанность (entanglement) — общие данные, разделяемые между несколькими полями.
 */
export interface EntangledBraneInfo {
  /** Уникальный идентификатор */
  id: number
  /** Указатель на блок в куче */
  blockPtr: number
  /** Размер блока в словах */
  blockSize: number
  /** Дополнительные аллокации */
  extraAllocs: { offset: number; size: number }[]
}

/**
 * Конфигурация менеджера бран.
 */
export interface BraneManagerConfig {
  /** Размер кучи в словах (по умолчанию 16384 = 64 КБ) */
  heapSize?: number
  /** Количество слов для резервирования в начале (по умолчанию 1, слово 0 = null) */
  reserveFirst?: number
}

/**
 * Менеджер бран.
 *
 * Управляет полями (ансамблем) и их бранами внутри границы.
 *
 * @example
 * ```ts
 * const manager = new BraneManager(device)
 * manager.registerField('hp', FieldType.F32)
 *
 * // Создание ансамбля полей
 * manager.createEnsemble([
 *   { hp: 100 },
 *   { hp: 80 }
 * ])
 *
 * // Получение буферов для передачи на GPU
 * const { fieldDescriptors, heap } = manager.getGPUBuffers()
 * ```
 */
export class BraneManager {
  private readonly registry: GlobalFieldRegistry
  private readonly allocator: HeapAllocator
  private readonly builder: BraneBuilder

  /** Хранилище информации о полях */
  private fields: Map<number, FieldInfo> = new Map()
  /** Хранилище информации о запутанных (entangled) бранах */
  private entangledBranes: Map<number, EntangledBraneInfo> = new Map()

  /** Счётчик ID полей */
  private nextFieldId: number = 0
  /** Счётчик ID запутанных бран */
  private nextEntangledId: number = 0

  /** Локальная копия кучи для записи данных */
  private heapData: Uint32Array
  /** Флаг "грязной" кучи (нужно обновить GPU буфер) */
  private heapDirty: boolean = false

  constructor(
    public readonly device: GPUDevice,
    config: BraneManagerConfig = {},
  ) {
    const heapSize = config.heapSize ?? 16384 // 64KB по умолчанию
    const reserveFirst = config.reserveFirst ?? 1 // Резервируем слово 0 как null-указатель

    this.registry = GlobalFieldRegistry.getInstance()
    this.allocator = new HeapAllocator(heapSize, reserveFirst)
    this.builder = new BraneBuilder(this.registry, this.allocator)

    this.heapData = new Uint32Array(heapSize)
    // Слово 0 = 0 (null pointer)
    this.heapData[0] = 0
  }

  /**
   * Зарегистрировать компоненту браны в глобальном реестре.
   *
   * @param name - Имя компоненты
   * @param type - Тип компоненты
   * @returns ID компоненты
   */
  registerField(name: string, type: FieldTypeValue, options: { elementType?: string; enumValues?: any[] } = {}): number {
    return this.registry.register(name, type, options)
  }

  /**
   * Создать запутанную (entangled) брану — разделяемые данные между полями.
   *
   * @param brane - Объект с компонентами {имя: значение}
   * @returns ID запутанной браны
   */
  createEntangledBrane(brane: Record<string, unknown>): number {
    const result = this.builder.build(brane, { sharedPtrs: [] })
    const entangledId = this.nextEntangledId++

    // Записываем основной блок в кучу.
    this.heapData.set(result.blockView, result.blockPtr)
    
    // Записываем дополнительные аллокации (строки, массивы)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }

    const entangledInfo: EntangledBraneInfo = {
      id: entangledId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
    }

    this.entangledBranes.set(entangledId, entangledInfo)
    this.heapDirty = true
    return entangledId
  }

  /**
   * Создать поле (Field) с указателями на запутанные браны.
   *
   * @param brane - Объект с компонентами {имя: значение}
   * @param entangledBraneIds - Массив ID запутанных бран
   * @returns ID поля
   */
  createField(brane: Record<string, unknown>, entangledBraneIds: number[] = []): number {
    // Преобразуем ID в указатели.
    const sharedPtrs = entangledBraneIds.map((id) => {
      const entangled = this.entangledBranes.get(id)
      if (!entangled) {
        throw new Error(`Запутанная брана с ID ${id} не найдена`)
      }
      return entangled.blockPtr
    })

    const result = this.builder.build(brane, { sharedPtrs })

    // Записываем основной блок в кучу.
    this.heapData.set(result.blockView, result.blockPtr)
    
    // Записываем дополнительные аллокации (строки, массивы)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }

    const fieldId = this.nextFieldId++
    const fieldInfo: FieldInfo = {
      id: fieldId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
      sharedPtrs,
    }

    this.fields.set(fieldId, fieldInfo)
    this.heapDirty = true
    return fieldId
  }

  /**
   * Создать ансамбль полей с автоматической группировкой общих данных бран.
   *
   * @param branes - Массив объектов {имя: значение}
   * @returns Массив ID полей в том же порядке
   */
  createEnsemble(branes: Array<Record<string, unknown>>): number[] {
    // 1. Анализ: строим карту "компонента -> набор полей-владельцев"
    const componentUsage = new Map<string, Set<number>>()
    branes.forEach((brane, idx) => {
      Object.keys(brane).forEach((component) => {
        if (!componentUsage.has(component)) componentUsage.set(component, new Set())
        componentUsage.get(component)!.add(idx)
      })
    })

    const valueEquals = (left: unknown, right: unknown): boolean => {
      if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) return false
        return left.every((value, idx) => Object.is(value, right[idx]))
      }
      return Object.is(left, right)
    }

    // 2. Группировка: компоненты с одинаковым набором владельцев -> одна запутанная брана.
    const entangledGroups = new Map<string, Set<string>>() // key -> components
    componentUsage.forEach((fieldIds, component) => {
      if (fieldIds.size < 2) return

      const key = Array.from(fieldIds).sort().join(",")
      const ids = Array.from(fieldIds)
      const firstValue = branes[ids[0]!]?.[component]
      const allSame = ids.every((idx) => valueEquals(branes[idx]![component], firstValue))
      if (!allSame) return

      if (!entangledGroups.has(key)) {
        entangledGroups.set(key, new Set())
      }
      entangledGroups.get(key)!.add(component)
    })

    const entangledBraneIds = new Map<string, number>() // key -> entangledBraneId
    entangledGroups.forEach((components, key) => {
      const fieldIdxs = key.split(",").map((value) => Number(value))
      const firstFieldIdx = fieldIdxs[0]!
      const fieldData = branes[firstFieldIdx] as Record<string, unknown>
      const brane = Object.fromEntries(Array.from(components).map((comp) => [comp, fieldData[comp]]))
      const entangledId = this.createEntangledBrane(brane)
      entangledBraneIds.set(key, entangledId)
    })

    // 3. Создание полей с указателями на запутанные браны.
    const fieldIds: number[] = []

    branes.forEach((brane, idx) => {
      const entangledIds: number[] = []
      const usedGroupKeys = new Set<string>()
      const localBrane: Record<string, unknown> = { ...brane }

      Object.keys(brane).forEach((component) => {
        const ids = componentUsage.get(component)!
        if (ids.size < 2) return

        const key = Array.from(ids).sort().join(",")
        if (!entangledBraneIds.has(key)) return

        delete localBrane[component]
        if (!usedGroupKeys.has(key)) {
          entangledIds.push(entangledBraneIds.get(key)!)
          usedGroupKeys.add(key)
        }
      })

      const fieldId = this.createField(localBrane, entangledIds)
      fieldIds.push(fieldId)
    })

    return fieldIds
  }

  /**
   * Обновить компоненту браны поля.
   *
   * Для компонент переменного размера (строки, массивы) выполняет free + re-allocate.
   *
   * @param fieldId - ID поля
   * @param componentName - Имя компоненты браны
   * @param newValue - Новое значение
   */
  updateBraneField(fieldId: number, componentName: string, newValue: unknown): void {
    const field = this.fields.get(fieldId)
    if (!field) {
      throw new Error(`Поле с ID ${fieldId} не найдено`)
    }

    const fieldMeta = this.registry.getMeta(componentName)
    if (!fieldMeta) {
      throw new Error(`Компонента браны '${componentName}' не зарегистрирована`)
    }

    // Читаем блок поля из кучи.
    const block = this.heapData.slice(field.blockPtr, field.blockPtr + field.blockSize)

    // Находим компоненту в блоке.
    const componentInfo = BlockUtils.findField(block, fieldMeta.componentId)
    if (!componentInfo) {
      throw new Error(`Компонента '${componentName}' не найдена в блоке поля`)
    }

    const absoluteOffset = field.blockPtr + componentInfo.meta.offset

    // Обновляем значение в зависимости от типа.
    switch (fieldMeta.type) {
      case FieldType.F32: {
        const view = new DataView(this.heapData.buffer)
        view.setFloat32(absoluteOffset * 4, Number(newValue), true)
        break
      }
      case FieldType.U32:
      case FieldType.BOOL:
        this.heapData[absoluteOffset] = Number(newValue)
        break
      case FieldType.STRING_PTR: {
        // Строки хранятся в формате [stringId, hash] через StringAtlas.
        // Важно: здесь нельзя аллоцировать raw-строку в heap, иначе GPU-операторы
        // EQ/NEQ/IN/NOT_IN получат не stringId и сравнения станут некорректными.
        const atlas = getStringAtlas()
        const str = String(newValue)
        const stringId = atlas.intern(str)
        const meta = atlas.getMeta(stringId)

        if (!meta) {
          throw new Error(`Не удалось получить метаданные для строки: ${str}`)
        }

        this.heapData[absoluteOffset] = stringId
        this.heapData[absoluteOffset + 1] = meta.hash
        break
      }
      case FieldType.ARRAY_PTR: {
        const oldOffset = this.heapData[absoluteOffset]!
        const oldLength = this.heapData[absoluteOffset + 1]!
        if (oldOffset > 0) {
          const oldWordCount = oldLength + 1
          this.allocator.free(oldOffset, oldWordCount)

          const idx = field.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            field.extraAllocs.splice(idx, 1)
          }
        }

        if (!Array.isArray(newValue)) {
          throw new Error(`Ожидался массив для компоненты '${componentName}'`)
        }

        const meta = this.registry.getMeta(componentName)
        const elementType = meta?.elementType
        const values = newValue as unknown[]
        const newWordCount = values.length + 1
        const newBlock = this.allocator.alloc(newWordCount)
        if (!newBlock) {
          throw new Error(`Недостаточно памяти для массива`)
        }

        const arrayView = new Uint32Array(newBlock.size)
        arrayView[0] = values.length
        for (let i = 0; i < values.length; i++) {
          const item = values[i]
          if (elementType === "float" || elementType === "number") {
            const buf = new Float32Array([Number(item)])
            arrayView[i + 1] = new Uint32Array(buf.buffer)[0]!
          } else if (elementType === "integer" || elementType === "boolean") {
            arrayView[i + 1] = Number(item)
          } else if (elementType === "string") {
            throw new Error(`Массивы строк пока не поддерживаются для компоненты '${componentName}'`)
          } else {
            arrayView[i + 1] = Number(item)
          }
        }

        this.heapData.set(arrayView, newBlock.offset)
        field.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })

        this.heapData[absoluteOffset] = newBlock.offset
        this.heapData[absoluteOffset + 1] = values.length
        break
      }
      default:
        throw new Error(`Неподдерживаемый тип компоненты: ${fieldMeta.type}`)
    }

    this.heapDirty = true
  }

  /**
   * Удалить поле.
   *
   * Освобождает память блока поля и всех его дополнительных аллокаций.
   *
   * @param fieldId - ID поля
   */
  deleteField(fieldId: number): void {
    const field = this.fields.get(fieldId)
    if (!field) {
      throw new Error(`Поле с ID ${fieldId} не найдено`)
    }

    // Освобождаем дополнительные аллокации (строки, массивы).
    for (const alloc of field.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок поля.
    this.allocator.free(field.blockPtr, field.blockSize)

    this.fields.delete(fieldId)
    this.heapDirty = true
  }

  /**
   * Удалить запутанную брану.
   *
   * @param entangledId - ID запутанной браны
   */
  deleteEntangledBrane(entangledId: number): void {
    const entangled = this.entangledBranes.get(entangledId)
    if (!entangled) {
      throw new Error(`Запутанная брана с ID ${entangledId} не найдена`)
    }

    // Освобождаем дополнительные аллокации.
    for (const alloc of entangled.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок.
    this.allocator.free(entangled.blockPtr, entangled.blockSize)

    this.entangledBranes.delete(entangledId)
    this.heapDirty = true
  }

  /**
   * Получить указатель на блок поля.
   */
  getFieldBlockPtr(fieldId: number): number {
    const field = this.fields.get(fieldId)
    if (!field) {
      throw new Error(`Поле с ID ${fieldId} не найдено`)
    }
    return field.blockPtr
  }

  /**
   * Получить указатель на блок запутанной браны.
   */
  getEntangledBlockPtr(entangledId: number): number {
    const entangled = this.entangledBranes.get(entangledId)
    if (!entangled) {
      throw new Error(`Запутанная брана с ID ${entangledId} не найдена`)
    }
    return entangled.blockPtr
  }

  /**
   * Получить буферы для передачи на GPU.
   *
   * @returns Объект с буферами { fieldDescriptors, heap }
   */
  getGPUBuffers(): { fieldDescriptors: Uint32Array; heap: Uint32Array } {
    // Создаём буфер дескрипторов полей: массив указателей на блоки.
    const fieldCount = this.fields.size
    const fieldDescriptors = new Uint32Array(fieldCount)
    let idx = 0
    for (const [, field] of this.fields) {
      fieldDescriptors[idx++] = field.blockPtr
    }

    return {
      fieldDescriptors,
      heap: this.heapData,
    }
  }

  /**
   * Проверить, нужно ли обновить GPU буферы.
   */
  isHeapDirty(): boolean {
    return this.heapDirty
  }

  /**
   * Сбросить флаг "грязной" кучи после обновления GPU.
   */
  clearDirtyFlag(): void {
    this.heapDirty = false
  }

  /**
   * Получить информацию о поле.
   */
  getFieldInfo(fieldId: number): FieldInfo | undefined {
    return this.fields.get(fieldId)
  }

  /**
   * Получить ансамбль (список всех полей).
   */
  getEnsemble(): FieldInfo[] {
    return Array.from(this.fields.values())
  }
}
