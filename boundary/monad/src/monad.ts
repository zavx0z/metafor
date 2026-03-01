/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * @packageDocumentation
 */

import {
  write as fieldsWrite,
  update as fieldsUpdate,
  type Field,
  type Data,
  type Brane,
  type BraneParamValue,
} from "@boundary/fields"
import type {
  ActionsStore,
  IndexToUuidStore,
  MonadId,
  StatesStore,
  SuperpositionsStore,
  UuidToIndexStore,
} from "./monad.t"
import type { FieldDefinition, FieldsDefinition } from "./field"
import type { MonadConfig } from "./types"
import { convertField } from "./field"
import { convertToNumeric } from "./superposition"

// ==================== Внутреннее состояние ====================
const _globalFields: Map<string, [number, Field]> = new Map()
const _fieldNameIndex: Map<string, number> = new Map()
const _actions: ActionsStore = new Map()
const _superpositions: SuperpositionsStore = new Map()
const _states: StatesStore = new Map()
const _monadParams: Map<MonadId, Record<string, unknown>> = new Map()
const _uuidToIndex: UuidToIndexStore = new Map()
const _indexToUuid: IndexToUuidStore = new Map()
const _stateMaps: Map<MonadId, string[]> = new Map() // states для reverse-маппинга
const _onStateChange: { current: ((monadId: MonadId, old: string, current: string) => void) | null } = { current: null }
const _monadIds: Set<MonadId> = new Set()
let _nextFieldIndex = 0
let _fieldsDefinition: FieldsDefinition = {}

// Экспорт для тестов
export function _resetState(): void {
  _globalFields.clear()
  _fieldNameIndex.clear()
  _actions.clear()
  _superpositions.clear()
  _states.clear()
  _monadParams.clear()
  _uuidToIndex.clear()
  _indexToUuid.clear()
  _stateMaps.clear()
  _onStateChange.current = null
  _monadIds.clear()
  _nextFieldIndex = 0
  _fieldsDefinition = {}
}

// ==================== Функции ====================

/**
 * Добавляет поле в глобальное хранилище.
 *
 * @param name - Имя поля.
 * @param field - Зарегистрированное поле.
 * @returns Индекс поля.
 * @throws {Error} Если тип поля конфликтует с существующим.
 */
function addMonadField(name: string, field: Field): number {
  const existing = _globalFields.get(name)
  if (existing) {
    const [existingIndex, existingField] = existing
    if (existingField.type !== field.type) {
      throw new Error(`Field '${name}' type conflict`)
    }
    return existingIndex
  }
  const newIndex = _nextFieldIndex++
  _globalFields.set(name, [newIndex, field])
  _fieldNameIndex.set(name, newIndex)
  return newIndex
}

/**
 * Конвертирует params из Record в кортежи [fieldIndex, value].
 */
function paramsToTuples(params: Record<string, unknown>): [number, BraneParamValue][] {
  const tuples: [number, BraneParamValue][] = []
  for (const [name, value] of Object.entries(params)) {
    const fieldIndex = _fieldNameIndex.get(name)
    if (fieldIndex !== undefined) {
      tuples.push([fieldIndex, value as BraneParamValue])
    }
  }
  return tuples
}

/**
 * Конфигурация монады.
 *
 * @remarks
 * **Порядок переходов в суперпозиции важен!**
 * Переходы проверяются в порядке объявления ключей.
 * Первый выполненный переход останавливает проверку.
 *
 * @example
 * ```typescript
 * createMonad({
 *   fields: {
 *     hp: { type: "number" },
 *     mana: { type: "number" },
 *     isAlive: { type: "boolean" }
 *   },
 *   params: { hp: 100, mana: 50, isAlive: true },
 *   state: "IDLE",
 *   superposition: {
 *     IDLE: {
 *       PATROL: { hp: { gt: 50 } },   // ← Приоритет 1: hp > 50
 *       DEAD: { hp: { lte: 0 } }      // ← Приоритет 2: hp <= 0
 *     },
 *     PATROL: {
 *       IDLE: { mana: { lt: 10 } },   // mana < 10 → IDLE
 *       COMBAT: { isAlive: true }     // isAlive === true → COMBAT
 *     },
 *     COMBAT: null,
 *     DEAD: null                       // Терминальное состояние
 *   },
 *   actions: {
 *     PATROL: () => console.log("Start patrol"),
 *     DEAD: () => console.log("Unit died")
 *   }
 * })
 * ```
 */
export function createMonad(config: MonadConfig): string {
  const id = crypto.randomUUID()
  _monadIds.add(id)
  for (const [name, def] of Object.entries(config.fields)) {
    const registeredField = convertField(def as FieldDefinition)
    addMonadField(name, registeredField)
    if (config.params[name] !== undefined) {
      // Сохраняем в _fieldsDefinition для последующего write()
      _fieldsDefinition[name] = def as FieldDefinition
    }
  }
  _monadParams.set(id, { ...config.params })
  _actions.set(id, config.actions)
  _superpositions.set(id, config.superposition)
  _states.set(id, config.state)
  return id
}

/**
 * Удаляет монаду.
 *
 * @param id - {@link MonadId} монады.
 */
export function deleteMonad(id: MonadId): void {
  _monadIds.delete(id)
  _monadParams.delete(id)
  _actions.delete(id)
  _superpositions.delete(id)
  _states.delete(id)
  _uuidToIndex.delete(id)
}

/**
 * Создаёт/пересоздаёт Boundary со всеми бранами через @boundary/fields.
 */
export async function updateBoundary(): Promise<void>
/**
 * Создаёт/пересоздаёт Boundary с блокировкой переходов для указанных монад.
 *
 * @param lockedMonadIds - IDs монад для временной блокировки переходов.
 *                         Блокировка действует только на этот вызов updateBoundary().
 *                         Автоматически сбрасывается после выполнения.
 */
export async function updateBoundary(lockedMonadIds?: MonadId[]): Promise<void>
export async function updateBoundary(lockedMonadIds?: MonadId[]): Promise<void> {
  const monadIds = Array.from(_monadIds)
  if (monadIds.length === 0) {
    return
  }
  // Собираем поля в массив Field[]
  const fieldsArray: Field[] = []
  for (const [_, [index, field]] of _globalFields.entries()) {
    fieldsArray[index] = field
  }
  // Конвертируем params и superposition для каждой монады
  const allBranes: Brane[] = monadIds.map((monadId) => {
    const monadParams = _monadParams.get(monadId)!
    const paramsTuples = paramsToTuples(monadParams)
    const monadSuperposition = _superpositions.get(monadId)!
    const converted = convertToNumeric(monadSuperposition, _fieldNameIndex)
    // Сохраняем states для reverse-маппинга
    _stateMaps.set(monadId, converted.states)
    // Находим индекс начального состояния
    const initialStateIndex = converted.states.indexOf(_states.get(monadId)!)
    if (initialStateIndex === -1) {
      throw new Error(`State '${_states.get(monadId)}' not found in superposition`)
    }
    return {
      params: paramsTuples,
      state: initialStateIndex,
      collapses: converted.boundary.transitions,
    }
  })
  // Инициализируем через @boundary/fields/write()
  const data: Data = {
    fields: fieldsArray,
    branes: allBranes,
  }
  const stateChanges = await fieldsWrite(data)
  // Маппинги
  _uuidToIndex.clear()
  _indexToUuid.clear()
  monadIds.forEach((monadId, i) => {
    _uuidToIndex.set(monadId, i)
    _indexToUuid.set(i, monadId)
  })
  // Обрабатываем изменения состояний
  stateChanges.forEach(([braneIndex, stateIndex]) => {
    const monadId = _indexToUuid.get(braneIndex)
    if (!monadId) return
    const stateMap = _stateMaps.get(monadId)
    if (!stateMap) {
      throw new Error(`State map not found for monad ${monadId}`)
    }
    const current = stateMap[stateIndex]!
    const old = _states.get(monadId)
    if (old !== undefined && current !== old) {
      _states.set(monadId, current)
      const actions = _actions.get(monadId)
      const action = actions?.[current]
      if (action) {
        const params = _monadParams.get(monadId)
        if (params) {
          action(params)
        }
      }
      _onStateChange.current?.(monadId, old, current)
    }
  })
}

/**
 * Обновление одной или нескольких монад.
 */
export interface MonadUpdate {
  /** ID монады */
  id: MonadId
  /** Новые значения полей (пустой объект для разблокировки без изменений) */
  fields?: Record<string, unknown>
  /** Если true, блокирует переходы для этой монады на один вызов */
  lock?: boolean
}

/**
 * Обновляет поля бран и выполняет шаг эволюции через @boundary/fields.
 *
 * @param updates - Массив обновлений: `[{ id, fields, lock }, ...]`
 * @throws {Error} Если Boundary не инициализирован. Вызовите updateBoundary() перед updateMonads().
 *
 * @example
 * ```typescript
 * // Обновить одну монаду
 * await updateMonads([{ id: 'uuid', fields: { hp: 80 } }])
 *
 * // Обновить несколько монад
 * await updateMonads([
 *   { id: 'uuid1', fields: { hp: 80 } },
 *   { id: 'uuid2', fields: { mana: 50 }, lock: true },  // с блокировкой
 * ])
 *
 * // Разблокировать монаду без изменения полей
 * await updateMonads([{ id: 'uuid', fields: {} }])
 * ```
 */
export async function updateMonads(updates: MonadUpdate[]): Promise<void> {
  if (updates.length === 0) {
    return
  }

  const allUpdates: Array<[number, Array<{ fieldIndex: number; value: unknown }>]> = []
  const lockedBranes: number[] = []

  for (const { id, fields = {}, lock } of updates) {
    const index = _uuidToIndex.get(id)
    if (index === undefined) {
      throw new Error(`Monad ${id} not found in boundary`)
    }

    // Обновляем params монады
    const monadParams = _monadParams.get(id)
    if (monadParams) {
      _monadParams.set(id, { ...monadParams, ...fields })
    }

    // Конвертируем в кортежи для update()
    const fieldUpdates = Object.entries(fields).map(([name, value]) => {
      const fieldIndex = _fieldNameIndex.get(name)
      if (fieldIndex === undefined) {
        throw new Error(`Field '${name}' not found`)
      }
      return { fieldIndex, value }
    })

    // Добавляем обновление в список
    if (fieldUpdates.length > 0) {
      allUpdates.push([index, fieldUpdates])
    }

    // Добавляем в список заблокированных
    if (lock) {
      lockedBranes.push(index)
    }
  }

  // Вызываем @boundary/fields/update()
  const stateChanges = await fieldsUpdate(allUpdates, lockedBranes.length > 0 ? lockedBranes : undefined)

  // Обрабатываем изменения состояний
  stateChanges.forEach(([braneIndex, stateIndex]) => {
    const monadId = _indexToUuid.get(braneIndex)
    if (!monadId) return
    const stateMap = _stateMaps.get(monadId)
    if (!stateMap) {
      throw new Error(`State map not found for monad ${monadId}`)
    }
    const current = stateMap[stateIndex]!
    const old = _states.get(monadId)
    if (old !== undefined && current !== old) {
      _states.set(monadId, current)
      const actions = _actions.get(monadId)
      const action = actions?.[current]
      if (action) {
        const params = _monadParams.get(monadId)
        if (params) {
          action(params)
        }
      }
      _onStateChange.current?.(monadId, old, current)
    }
  })
}

/**
 * @deprecated Используйте {@link updateMonads} вместо updateMonad.
 * Обновляет поля одной монады.
 */
export async function updateMonad(id: MonadId, fields: Record<string, unknown>, locked?: boolean): Promise<void> {
  await updateMonads([{ id, fields, lock: locked }])
}

/**
 * Устанавливает callback на изменение состояния.
 *
 * @param callback - Функция обратного вызова.
 *
 * @example
 * ```typescript
 * onStateChange((monadId, old, current) => {
 *   console.log(`State changed: ${old} → ${current}`)
 * })
 * ```
 */
export function onStateChange(callback: (monadId: MonadId, old: string, current: string) => void): void {
  _onStateChange.current = callback
}
