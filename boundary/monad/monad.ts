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
  IntentionsStore,
  IndexToUuidStore,
  MonadId,
  StatesStore,
  SuperpositionsStore,
  UuidToIndexStore,
  ProcessesStore,
  ProcessKey,
} from "./monad.t"
import type { FieldDefinition, FieldsDefinition } from "./field"
import type { MonadConfig, Intention } from "./types"
import type { ParsedProcessJson } from "../../dsl/build/monadJson"
import { convertField } from "./field"
import { convertToNumeric } from "./superposition"

/**
 * Изменение состояния браны.
 */
export interface BraneStateChange {
  /** ID монады */
  monadId: MonadId
  /** Предыдущее состояние */
  oldState: string
  /** Текущее состояние */
  newState: string
  /** Намерение (ключ процесса) если есть */
  intention?: Intention | null
  /** Текущие параметры монады */
  params: Record<string, unknown>
}

// ==================== Внутреннее состояние ====================
const _globalFields: Map<string, [number, Field]> = new Map()
const _fieldNameIndex: Map<string, number> = new Map()
const _intentions: IntentionsStore = new Map()
const _processes: ProcessesStore = new Map()
const _superpositions: SuperpositionsStore = new Map()
const _states: StatesStore = new Map()
const _monadParams: Map<MonadId, Record<string, unknown>> = new Map()
const _uuidToIndex: UuidToIndexStore = new Map()
const _indexToUuid: IndexToUuidStore = new Map()
const _stateMaps: Map<MonadId, string[]> = new Map() // states для reverse-маппинга
const _onStateChange: { current: ((changes: BraneStateChange[]) => void) | null } = { current: null }
const _monadIds: Set<MonadId> = new Set()
let _nextFieldIndex = 0
let _fieldsDefinition: FieldsDefinition = {}

// Экспорт для тестов
export function _resetState(): void {
  _globalFields.clear()
  _fieldNameIndex.clear()
  _intentions.clear()
  _processes.clear()
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
 *   intentions: {
 *     PATROL: "patrolProcess",        // Ключ процесса из DSL
 *     DEAD: "deathProcess"
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
  _intentions.set(id, config.intentions ?? {})
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
  _intentions.delete(id)
  _superpositions.delete(id)
  _states.delete(id)
  _uuidToIndex.delete(id)
}

/**
 * Регистрирует схемы процессов из DSL.
 *
 * @param processes - Объект с ключами процессов и их схемами из DSL.
 *
 * @example
 * ```typescript
 * registerProcesses({
 *   patrolProcess: {
 *     type: "action",
 *     label: "Патруль",
 *     action: { src: "./actions/patrol.ts", read: ["position"] }
 *   },
 *   deathProcess: {
 *     type: "action",
 *     label: "Смерть",
 *     action: { src: "./actions/death.ts", read: ["hp"] }
 *   }
 * })
 * ```
 */
export function registerProcesses(processes: Record<ProcessKey, ParsedProcessJson>): void {
  for (const [key, schema] of Object.entries(processes)) {
    _processes.set(key, schema as ParsedProcessJson)
  }
}

/**
 * Получает схему процесса по ключу.
 *
 * @param processKey - Ключ процесса (ID намерения).
 * @returns Схема процесса или undefined если не найдена.
 */
export function getProcessSchema(processKey: ProcessKey): ParsedProcessJson | undefined {
  return _processes.get(processKey)
}

/**
 * Создаёт/пересоздаёт Boundary со всеми бранами.
 *
 */
export async function updateBoundary(): Promise<void> {
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
  const changes: BraneStateChange[] = []
  const monadsToUnlock: MonadId[] = []

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
      const intentions = _intentions.get(monadId)
      const intention = intentions?.[current]
      changes.push({
        monadId,
        oldState: old,
        newState: current,
        intention: intention ?? null,
        params: _monadParams.get(monadId)!,
      })
      // Авто-снятие блокировки если нет намерения (MONAD — Замысел)
      if (!intention) {
        monadsToUnlock.push(monadId)
      }
    }
  })

  // Снимаем блокировку с бран без намерения
  if (monadsToUnlock.length > 0) {
    const unlockUpdates = monadsToUnlock.map((id) => ({
      id,
      fields: {},
      lock: false,
    }))
    await updateMonads(unlockUpdates)
  }

  // Пакетная отправка изменений
  if (changes.length > 0 && _onStateChange.current) {
    _onStateChange.current(changes)
  }
}

/**
 * Обновление одной или нескольких монад.
 */
export interface MonadUpdate {
  /** ID монады */
  id: MonadId
  /** Новые значения полей (пустой объект для разблокировки без изменений) */
  fields?: Record<string, unknown>
  /** Если true, блокирует переходы; если false — разблокирует; undefined — не менять */
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
 * // Обновить с блокировкой
 * await updateMonads([{ id: 'uuid', fields: { hp: 80 }, lock: true }])
 *
 * // Разблокировать без изменения полей
 * await updateMonads([{ id: 'uuid', fields: {}, lock: false }])
 * ```
 */
export async function updateMonads(updates: MonadUpdate[]): Promise<BraneStateChange[]> {
  if (updates.length === 0) {
    return []
  }

  const allUpdates: Array<[number, Array<[number, unknown]>, boolean?]> = []

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
      return [fieldIndex, value] as [number, unknown]
    })

    // Добавляем обновление: [braneIndex, fieldUpdates, lock?]
    if (lock !== undefined) {
      allUpdates.push([index, fieldUpdates, lock])
    } else {
      allUpdates.push([index, fieldUpdates])
    }
  }

  // Вызываем @boundary/fields/update()
  const stateChanges = await fieldsUpdate(allUpdates)

  // Обрабатываем изменения состояний
  const changes: BraneStateChange[] = []
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
      const intentions = _intentions.get(monadId)
      const intention = intentions?.[current]
      changes.push({
        monadId,
        oldState: old,
        newState: current,
        intention: intention ?? null,
        params: _monadParams.get(monadId)!,
      })
    }
  })
  // Пакетная отправка изменений
  if (changes.length > 0 && _onStateChange.current) {
    _onStateChange.current(changes)
  }
  return changes
}

/**
 * Устанавливает callback на изменение состояния.
 *
 * @param callback - Функция обратного вызова, получает массив изменений всех бран.
 *
 * @example
 * ```typescript
 * onStateChange((changes) => {
 *   for (const { monadId, oldState, newState, intention, params } of changes) {
 *     console.log(`${monadId}: ${oldState} → ${newState}, intention: ${intention}`)
 *   }
 * })
 * ```
 */
export function onStateChange(callback: (changes: BraneStateChange[]) => void): void {
  _onStateChange.current = callback
}

/**
 * Снимает блокировку с монад после завершения процессов.
 *
 * Вызывается WEAK FORCE после завершения всех процессов для разблокировки бран.
 *
 * @param monadIds - IDs монад для разблокировки. Если не указаны, разблокируются все.
 *
 * @example
 * ```typescript
 * // После завершения процессов
 * await releaseLock(['uuid1', 'uuid2'])
 *
 * // Разблокировать все
 * await releaseLock()
 * ```
 */
export async function releaseLock(monadIds?: MonadId[]): Promise<void> {
  const idsToUnlock = monadIds ?? Array.from(_monadIds)

  if (idsToUnlock.length === 0) {
    return
  }

  const unlockUpdates = idsToUnlock.map((id) => ({
    id,
    fields: {},
    lock: false,
  }))

  await updateMonads(unlockUpdates)
}
