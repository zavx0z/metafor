/**
 * @file Менеджер бран.
 *
 * Высокоуровневый API для управления жизненным циклом квантов и их бран.
 * Координирует работу GlobalFieldRegistry, HeapAllocator и BraneBuilder.
 *
 * @packageDocumentation
 */

import { GlobalFieldRegistry, FieldType, type FieldTypeValue } from "./GlobalFieldRegistry"
import { HeapAllocator } from "./HeapAllocator"
import { BraneBuilder, BlockUtils } from "./BraneBuilder"

/**
 * Информация о кванте (агенте).
 */
export interface QuantumInfo {
  /** Уникальный идентификатор кванта */
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
 * Информация о разделяемой бране.
 */
export interface SharedBraneInfo {
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
 * Управляет квантами (суперпозицией) и бранами.
 *
 * @example
 * ```ts
 * const manager = new BraneManager(device)
 * manager.registerField('hp', FieldType.F32)
 *
 * // Создание суперпозиции квантов
 * manager.createSuperposition([
 *   { hp: 100 },
 *   { hp: 80 }
 * ])
 *
 * // Получение буферов для передачи на GPU
 * const { agentDescriptors, heap } = manager.getGPUBuffers()
 * ```
 */
export class BraneManager {
  private readonly registry: GlobalFieldRegistry
  private readonly allocator: HeapAllocator
  private readonly builder: BraneBuilder

  /** Хранилище информации о квантах */
  private quanta: Map<number, QuantumInfo> = new Map()
  /** Хранилище информации о shared бранах */
  private sharedBranes: Map<number, SharedBraneInfo> = new Map()

  /** Счётчик ID квантов */
  private nextQuantumId: number = 0
  /** Счётчик ID shared бран */
  private nextSharedId: number = 0

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
   * Зарегистрировать поле в глобальном реестре.
   *
   * @param name - Имя поля
   * @param type - Тип поля
   * @returns ID поля
   */
  registerField(name: string, type: FieldTypeValue, options: { elementType?: string; enumValues?: any[] } = {}): number {
    return this.registry.register(name, type, options)
  }

  /**
   * Создать разделяемую брану.
   *
   * @param brane - Объект с полями {имя: значение}
   * @returns ID разделяемой браны
   */
  createSharedBrane(brane: Record<string, unknown>): number {
    const result = this.builder.build(brane, { sharedPtrs: [] })
    const sharedId = this.nextSharedId++

    // Записываем основной блок в кучу.
    this.heapData.set(result.blockView, result.blockPtr)
    
    // Записываем дополнительные аллокации (строки, массивы)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }

    const sharedInfo: SharedBraneInfo = {
      id: sharedId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
    }

    this.sharedBranes.set(sharedId, sharedInfo)
    this.heapDirty = true
    return sharedId
  }

  /**
   * Создать квант с указателями на разделяемые браны.
   *
   * @param brane - Объект с полями {имя: значение}
   * @param sharedBraneIds - Массив ID разделяемых бран
   * @returns ID кванта
   */
  createQuantum(brane: Record<string, unknown>, sharedBraneIds: number[] = []): number {
    // Преобразуем ID в указатели.
    const sharedPtrs = sharedBraneIds.map((id) => {
      const shared = this.sharedBranes.get(id)
      if (!shared) {
        throw new Error(`Shared брана с ID ${id} не найдена`)
      }
      return shared.blockPtr
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

    const quantumId = this.nextQuantumId++
    const quantumInfo: QuantumInfo = {
      id: quantumId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
      sharedPtrs,
    }

    this.quanta.set(quantumId, quantumInfo)
    this.heapDirty = true
    return quantumId
  }

  /**
   * Создать суперпозицию (множество квантов) с автоматической группировкой общих полей.
   *
   * @param branes - Массив объектов {имя: значение}
   * @returns Массив ID квантов в том же порядке
   */
  createSuperposition(branes: Array<Record<string, unknown>>): number[] {
    // 1. Анализ: строим карту "поле -> набор квантов-владельцев"
    const fieldUsage = new Map<string, Set<number>>()
    branes.forEach((brane, idx) => {
      Object.keys(brane).forEach((field) => {
        if (!fieldUsage.has(field)) fieldUsage.set(field, new Set())
        fieldUsage.get(field)!.add(idx)
      })
    })

    const valueEquals = (left: unknown, right: unknown): boolean => {
      if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) return false
        return left.every((value, idx) => Object.is(value, right[idx]))
      }
      return Object.is(left, right)
    }

    // 2. Группировка: поля с одинаковым набором владельцев -> один shared блок.
    const sharedGroups = new Map<string, Set<string>>() // key -> fields
    fieldUsage.forEach((quantumIds, field) => {
      if (quantumIds.size < 2) return

      const key = Array.from(quantumIds).sort().join(",")
      const ids = Array.from(quantumIds)
      const firstValue = branes[ids[0]!]?.[field]
      const allSame = ids.every((idx) => valueEquals(branes[idx]![field], firstValue))
      if (!allSame) return

      if (!sharedGroups.has(key)) {
        sharedGroups.set(key, new Set())
      }
      sharedGroups.get(key)!.add(field)
    })

    const sharedBraneIds = new Map<string, number>() // key -> sharedBraneId
    sharedGroups.forEach((fields, key) => {
      const quantumIds = key.split(",").map((value) => Number(value))
      const firstQuantumIdx = quantumIds[0]!
      const quantumData = branes[firstQuantumIdx] as Record<string, unknown>
      const brane = Object.fromEntries(Array.from(fields).map((field) => [field, quantumData[field]]))
      const sharedId = this.createSharedBrane(brane)
      sharedBraneIds.set(key, sharedId)
    })

    // 3. Создание квантов с указателями на разделяемые блоки.
    const quantumIds: number[] = []

    branes.forEach((brane, idx) => {
      const sharedIds: number[] = []
      const usedGroupKeys = new Set<string>()
      const localBrane: Record<string, unknown> = { ...brane }

      Object.keys(brane).forEach((field) => {
        const ids = fieldUsage.get(field)!
        if (ids.size < 2) return

        const key = Array.from(ids).sort().join(",")
        if (!sharedBraneIds.has(key)) return

        delete localBrane[field]
        if (!usedGroupKeys.has(key)) {
          sharedIds.push(sharedBraneIds.get(key)!)
          usedGroupKeys.add(key)
        }
      })

      const quantumId = this.createQuantum(localBrane, sharedIds)
      quantumIds.push(quantumId)
    })

    return quantumIds
  }

  /**
   * Обновить брану кванта.
   *
   * Для полей переменного размера (строки, массивы) выполняет free + re-allocate.
   *
   * @param quantumId - ID кванта
   * @param fieldName - Имя поля
   * @param newValue - Новое значение
   */
  updateBraneField(quantumId: number, fieldName: string, newValue: unknown): void {
    const quantum = this.quanta.get(quantumId)
    if (!quantum) {
      throw new Error(`Квант с ID ${quantumId} не найден`)
    }

    const fieldMeta = this.registry.getMeta(fieldName)
    if (!fieldMeta) {
      throw new Error(`Поле '${fieldName}' не зарегистрировано`)
    }

    // Читаем блок кванта из кучи.
    const block = this.heapData.slice(quantum.blockPtr, quantum.blockPtr + quantum.blockSize)

    // Находим поле в блоке.
    const fieldInfo = BlockUtils.findField(block, fieldMeta.fieldId)
    if (!fieldInfo) {
      throw new Error(`Поле '${fieldName}' не найдено в блоке кванта`)
    }

    const absoluteOffset = quantum.blockPtr + fieldInfo.meta.offset

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
        // Освобождаем старую строку.
        const oldOffset = this.heapData[absoluteOffset]!
        const oldLength = this.heapData[absoluteOffset + 1]!
        if (oldOffset > 0) {
          const oldWordCount = Math.ceil(oldLength / 4) + 1
          this.allocator.free(oldOffset, oldWordCount)

          // Удаляем из extraAllocs.
          const idx = quantum.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            quantum.extraAllocs.splice(idx, 1)
          }
        }

        // Аллоцируем новую строку.
        const str = String(newValue)
        const encoded = new TextEncoder().encode(str)
        const newWordCount = Math.ceil(encoded.length / 4) + 1
        const newBlock = this.allocator.alloc(newWordCount)
        if (!newBlock) {
          throw new Error(`Недостаточно памяти для строки`)
        }

        // Записываем длину и байты строки.
        const stringView = new Uint8Array(newBlock.size * 4)
        new DataView(stringView.buffer).setUint32(0, encoded.length, true)
        stringView.set(encoded, 4)

        const heapWords = new Uint32Array(stringView.buffer)
        quantum.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })
        this.heapData.set(heapWords, newBlock.offset)

        // Обновляем указатель в блоке кванта.
        this.heapData[absoluteOffset] = newBlock.offset
        this.heapData[absoluteOffset + 1] = encoded.length
        break
      }
      case FieldType.ARRAY_PTR: {
        const oldOffset = this.heapData[absoluteOffset]!
        const oldLength = this.heapData[absoluteOffset + 1]!
        if (oldOffset > 0) {
          const oldWordCount = oldLength + 1
          this.allocator.free(oldOffset, oldWordCount)

          const idx = quantum.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            quantum.extraAllocs.splice(idx, 1)
          }
        }

        if (!Array.isArray(newValue)) {
          throw new Error(`Ожидался массив для поля '${fieldName}'`)
        }

        const meta = this.registry.getMeta(fieldName)
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
            throw new Error(`Массивы строк пока не поддерживаются для поля '${fieldName}'`)
          } else {
            arrayView[i + 1] = Number(item)
          }
        }

        this.heapData.set(arrayView, newBlock.offset)
        quantum.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })

        this.heapData[absoluteOffset] = newBlock.offset
        this.heapData[absoluteOffset + 1] = values.length
        break
      }
      default:
        throw new Error(`Неподдерживаемый тип поля: ${fieldMeta.type}`)
    }

    this.heapDirty = true
  }

  /**
   * Удалить квант.
   *
   * Освобождает память блока кванта и всех его дополнительных аллокаций.
   *
   * @param quantumId - ID кванта
   */
  deleteQuantum(quantumId: number): void {
    const quantum = this.quanta.get(quantumId)
    if (!quantum) {
      throw new Error(`Квант с ID ${quantumId} не найден`)
    }

    // Освобождаем дополнительные аллокации (строки, массивы).
    for (const alloc of quantum.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок кванта.
    this.allocator.free(quantum.blockPtr, quantum.blockSize)

    this.quanta.delete(quantumId)
    this.heapDirty = true
  }

  /**
   * Удалить разделяемую брану.
   *
   * @param sharedId - ID разделяемой браны
   */
  deleteSharedBrane(sharedId: number): void {
    const shared = this.sharedBranes.get(sharedId)
    if (!shared) {
      throw new Error(`Shared брана с ID ${sharedId} не найдена`)
    }

    // Освобождаем дополнительные аллокации.
    for (const alloc of shared.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок.
    this.allocator.free(shared.blockPtr, shared.blockSize)

    this.sharedBranes.delete(sharedId)
    this.heapDirty = true
  }

  /**
   * Получить указатель на блок кванта.
   */
  getQuantumBlockPtr(quantumId: number): number {
    const quantum = this.quanta.get(quantumId)
    if (!quantum) {
      throw new Error(`Квант с ID ${quantumId} не найден`)
    }
    return quantum.blockPtr
  }

  /**
   * Получить указатель на блок shared браны.
   */
  getSharedBlockPtr(sharedId: number): number {
    const shared = this.sharedBranes.get(sharedId)
    if (!shared) {
      throw new Error(`Shared брана с ID ${sharedId} не найдена`)
    }
    return shared.blockPtr
  }

  /**
   * Получить буферы для передачи на GPU.
   *
   * @returns Объект с буферами { agentDescriptors, heap }
   */
  getGPUBuffers(): { quantumDescriptors: Uint32Array; heap: Uint32Array } {
    // Создаём буфер дескрипторов квантов: массив указателей на блоки.
    const quantumCount = this.quanta.size
    const quantumDescriptors = new Uint32Array(quantumCount)
    let idx = 0
    for (const [, quantum] of this.quanta) {
      quantumDescriptors[idx++] = quantum.blockPtr
    }

    return {
      quantumDescriptors,
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
   * Получить информацию о кванте.
   */
  getQuantumInfo(quantumId: number): QuantumInfo | undefined {
    return this.quanta.get(quantumId)
  }

  /**
   * Получить суперпозицию (список всех квантов).
   */
  getSuperposition(): QuantumInfo[] {
    return Array.from(this.quanta.values())
  }
}
