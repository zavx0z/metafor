/**
 * @file Менеджер контекстов агентов.
 *
 * Высокоуровневый API для управления жизненным циклом агентов и их контекстов.
 * Координирует работу GlobalFieldRegistry, HeapAllocator и ContextBuilder.
 *
 * @packageDocumentation
 */

import { GlobalFieldRegistry, FieldType, type FieldTypeValue } from "./GlobalFieldRegistry"
import { HeapAllocator } from "./HeapAllocator"
import { ContextBuilder, encodeString, BlockUtils } from "./ContextBuilder"

/**
 * Информация об агенте.
 */
export interface AgentInfo {
  /** Уникальный идентификатор агента */
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
 * Информация о разделяемом контексте.
 */
export interface SharedContextInfo {
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
 * Конфигурация менеджера.
 */
export interface ContextManagerConfig {
  /** Размер кучи в словах (по умолчанию 16384 = 64 КБ) */
  heapSize?: number
  /** Количество слов для резервирования в начале (по умолчанию 1, слово 0 = null) */
  reserveFirst?: number
}

/**
 * Менеджер контекстов агентов.
 *
 * @example
 * ```ts
 * const manager = new ContextManager(device)
 * manager.registerField('hp', FieldType.F32)
 * manager.registerField('name', FieldType.STRING_PTR)
 *
 * // Автоматическая группировка общих полей
 * manager.createAgents([
 *   { hp: 100, rage: 50, temperature: 25 },
 *   { mana: 80, temperature: 25, teamId: 7 },
 *   { armor: 90, temperature: 25, teamId: 7 }
 * ])
 *
 * // Получение буферов для передачи на GPU
 * const { agentDescriptors, heap } = manager.getGPUBuffers()
 * ```
 */
export class ContextManager {
  private readonly registry: GlobalFieldRegistry
  private readonly allocator: HeapAllocator
  private readonly builder: ContextBuilder

  /** Хранилище информации об агентах */
  private agents: Map<number, AgentInfo> = new Map()
  /** Хранилище информации о shared контекстах */
  private sharedContexts: Map<number, SharedContextInfo> = new Map()

  /** Счётчик ID агентов */
  private nextAgentId: number = 0
  /** Счётчик ID shared контекстов */
  private nextSharedId: number = 0

  /** Локальная копия кучи для записи данных */
  private heapData: Uint32Array
  /** Флаг "грязной" кучи (нужно обновить GPU буфер) */
  private heapDirty: boolean = false

  constructor(
    public readonly device: GPUDevice,
    config: ContextManagerConfig = {},
  ) {
    const heapSize = config.heapSize ?? 16384 // 64KB по умолчанию
    const reserveFirst = config.reserveFirst ?? 1 // Резервируем слово 0 как null-указатель

    this.registry = GlobalFieldRegistry.getInstance()
    this.allocator = new HeapAllocator(heapSize, reserveFirst)
    this.builder = new ContextBuilder(this.registry, this.allocator)

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
   * Создать разделяемый контекст.
   *
   * @param context - Объект с полями {имя: значение}
   * @returns ID разделяемого контекста
   */
  createSharedContext(context: Record<string, unknown>): number {
    const result = this.builder.build(context, { sharedPtrs: [] })
    const sharedId = this.nextSharedId++

    // Записываем основной блок в кучу.
    this.heapData.set(result.blockView, result.blockPtr)
    
    // Записываем дополнительные аллокации (строки, массивы)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }

    const sharedInfo: SharedContextInfo = {
      id: sharedId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
    }

    this.sharedContexts.set(sharedId, sharedInfo)
    this.heapDirty = true
    return sharedId
  }

  /**
   * Создать агента с указателями на разделяемые контексты.
   *
   * @param context - Объект с полями {имя: значение}
   * @param sharedContextIds - Массив ID разделяемых контекстов
   * @returns ID агента
   */
  createAgent(context: Record<string, unknown>, sharedContextIds: number[] = []): number {
    // Преобразуем ID в указатели.
    const sharedPtrs = sharedContextIds.map((id) => {
      const shared = this.sharedContexts.get(id)
      if (!shared) {
        throw new Error(`Shared контекст с ID ${id} не найден`)
      }
      return shared.blockPtr
    })

    const result = this.builder.build(context, { sharedPtrs })

    // Записываем основной блок в кучу.
    this.heapData.set(result.blockView, result.blockPtr)
    
    // Записываем дополнительные аллокации (строки, массивы)
    for (const alloc of result.extraAllocs) {
      if (alloc.data) {
        this.heapData.set(alloc.data, alloc.offset)
      }
    }

    const agentId = this.nextAgentId++
    const agentInfo: AgentInfo = {
      id: agentId,
      blockPtr: result.blockPtr,
      blockSize: result.blockSize,
      extraAllocs: result.extraAllocs.map(({ offset, size }) => ({ offset, size })),
      sharedPtrs,
    }

    this.agents.set(agentId, agentInfo)
    this.heapDirty = true
    return agentId
  }

  /**
   * Создать агентов с автоматической группировкой общих полей.
   *
   * @param agents - Массив объектов {имя: значение}
   * @returns Массив ID агентов в том же порядке
   */
  createAgents(agents: Array<Record<string, unknown>>): number[] {
    // 1. Анализ: строим карту "поле -> набор агентов-владельцев"
    const fieldUsage = new Map<string, Set<number>>()
    agents.forEach((agent, idx) => {
      Object.keys(agent).forEach((field) => {
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
    fieldUsage.forEach((agentIds, field) => {
      if (agentIds.size < 2) return

      const key = Array.from(agentIds).sort().join(",")
      const ids = Array.from(agentIds)
      const firstValue = agents[ids[0]!]?.[field]
      const allSame = ids.every((idx) => valueEquals(agents[idx]![field], firstValue))
      if (!allSame) return

      if (!sharedGroups.has(key)) {
        sharedGroups.set(key, new Set())
      }
      sharedGroups.get(key)!.add(field)
    })

    const sharedContextIds = new Map<string, number>() // key -> sharedContextId
    sharedGroups.forEach((fields, key) => {
      const agentIds = key.split(",").map((value) => Number(value))
      const firstAgentIdx = agentIds[0]!
      const agentData = agents[firstAgentIdx] as Record<string, unknown>
      const context = Object.fromEntries(Array.from(fields).map((field) => [field, agentData[field]]))
      const sharedId = this.createSharedContext(context)
      sharedContextIds.set(key, sharedId)
    })

    // 3. Создание агентов с указателями на разделяемые блоки.
    const agentIds: number[] = []

    agents.forEach((agent, idx) => {
      const sharedIds: number[] = []
      const usedGroupKeys = new Set<string>()
      const localContext: Record<string, unknown> = { ...agent }

      Object.keys(agent).forEach((field) => {
        const agentIds = fieldUsage.get(field)!
        if (agentIds.size < 2) return

        const key = Array.from(agentIds).sort().join(",")
        if (!sharedContextIds.has(key)) return

        delete localContext[field]
        if (!usedGroupKeys.has(key)) {
          sharedIds.push(sharedContextIds.get(key)!)
          usedGroupKeys.add(key)
        }
      })

      const agentId = this.createAgent(localContext, sharedIds)
      agentIds.push(agentId)
    })

    return agentIds
  }

  /**
   * Обновить поле агента.
   *
   * Для полей переменного размера (строки, массивы) выполняет free + re-allocate.
   *
   * @param agentId - ID агента
   * @param fieldName - Имя поля
   * @param newValue - Новое значение
   */
  updateAgentField(agentId: number, fieldName: string, newValue: unknown): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Агент с ID ${agentId} не найден`)
    }

    const fieldMeta = this.registry.getMeta(fieldName)
    if (!fieldMeta) {
      throw new Error(`Поле '${fieldName}' не зарегистрировано`)
    }

    // Читаем блок агента из кучи.
    const block = this.heapData.slice(agent.blockPtr, agent.blockPtr + agent.blockSize)

    // Находим поле в блоке.
    const fieldInfo = BlockUtils.findField(block, fieldMeta.fieldId)
    if (!fieldInfo) {
      throw new Error(`Поле '${fieldName}' не найдено в блоке агента`)
    }

    const absoluteOffset = agent.blockPtr + fieldInfo.meta.offset

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
          const idx = agent.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            agent.extraAllocs.splice(idx, 1)
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
        agent.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })
        this.heapData.set(heapWords, newBlock.offset)

        // Обновляем указатель в блоке агента.
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

          const idx = agent.extraAllocs.findIndex((a) => a.offset === oldOffset)
          if (idx >= 0) {
            agent.extraAllocs.splice(idx, 1)
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
        agent.extraAllocs.push({ offset: newBlock.offset, size: newBlock.size })

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
   * Удалить агента.
   *
   * Освобождает память блока агента и всех его дополнительных аллокаций.
   *
   * @param agentId - ID агента
   */
  deleteAgent(agentId: number): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Агент с ID ${agentId} не найден`)
    }

    // Освобождаем дополнительные аллокации (строки, массивы).
    for (const alloc of agent.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок агента.
    this.allocator.free(agent.blockPtr, agent.blockSize)

    this.agents.delete(agentId)
    this.heapDirty = true
  }

  /**
   * Удалить разделяемый контекст.
   *
   * @param sharedId - ID разделяемого контекста
   */
  deleteSharedContext(sharedId: number): void {
    const shared = this.sharedContexts.get(sharedId)
    if (!shared) {
      throw new Error(`Shared контекст с ID ${sharedId} не найден`)
    }

    // Освобождаем дополнительные аллокации.
    for (const alloc of shared.extraAllocs) {
      this.allocator.free(alloc.offset, alloc.size)
    }

    // Освобождаем блок.
    this.allocator.free(shared.blockPtr, shared.blockSize)

    this.sharedContexts.delete(sharedId)
    this.heapDirty = true
  }

  /**
   * Получить указатель на блок агента.
   */
  getAgentBlockPtr(agentId: number): number {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Агент с ID ${agentId} не найден`)
    }
    return agent.blockPtr
  }

  /**
   * Получить указатель на блок shared контекста.
   */
  getSharedBlockPtr(sharedId: number): number {
    const shared = this.sharedContexts.get(sharedId)
    if (!shared) {
      throw new Error(`Shared контекст с ID ${sharedId} не найден`)
    }
    return shared.blockPtr
  }

  /**
   * Получить буферы для передачи на GPU.
   *
   * @returns Объект с буферами { agentDescriptors, heap }
   */
  getGPUBuffers(): { agentDescriptors: Uint32Array; heap: Uint32Array } {
    // Создаём буфер дескрипторов агентов: массив указателей на блоки.
    const agentCount = this.agents.size
    const agentDescriptors = new Uint32Array(agentCount)
    let idx = 0
    for (const [, agent] of this.agents) {
      agentDescriptors[idx++] = agent.blockPtr
    }

    return {
      agentDescriptors,
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
   * Получить информацию об агенте.
   */
  getAgentInfo(agentId: number): AgentInfo | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Получить информацию о всех агентах.
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values())
  }
}
