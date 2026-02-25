/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * @packageDocumentation
 */

import { Boundary, type Field } from "@metafor/boundary"
import type {
  ActionsStore,
  IndexToUuidStore,
  MonadId,
  StatesStore,
  SuperpositionsStore,
  UuidToIndexStore,
} from "./monad.t"
import type { MonadConfig, Superposition } from "./types"
import { convertField } from "./field"
import { convertToNumeric } from "./superposition"

// ==================== Внутреннее состояние ====================

const _boundary: { current: Boundary | null } = { current: null }
const _globalFields: Map<string, [number, Field]> = new Map()
const _fieldNameIndex: Map<string, number> = new Map()
const _params: Map<string, unknown> = new Map()
const _fieldUsageCount: Map<string, number> = new Map()
const _actions: ActionsStore = new Map()
const _superpositions: SuperpositionsStore = new Map()
const _states: StatesStore = new Map()
const _monadParams: Map<MonadId, Record<string, unknown>> = new Map()
const _uuidToIndex: UuidToIndexStore = new Map()
const _indexToUuid: IndexToUuidStore = new Map()
const _onStateChange: { current: ((monadId: MonadId, old: string, current: string) => void) | null } = { current: null }
const _monadIds: Set<MonadId> = new Set()
let _nextFieldIndex = 0

// Экспорт для тестов
export function _resetState(): void {
  _boundary.current = null
  _globalFields.clear()
  _fieldNameIndex.clear()
  _params.clear()
  _fieldUsageCount.clear()
  _actions.clear()
  _superpositions.clear()
  _states.clear()
  _monadParams.clear()
  _uuidToIndex.clear()
  _indexToUuid.clear()
  _onStateChange.current = null
  _monadIds.clear()
  _nextFieldIndex = 0
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
 * Создаёт и регистрирует монаду.
 *
 * @param config - Конфигурация монады.
 * @returns UUID созданной монады.
 */
export function createMonad(config: MonadConfig): string {
  const id = crypto.randomUUID()
  _monadIds.add(id)

  for (const [name, def] of Object.entries(config.fields)) {
    const registeredField = convertField(def)
    addMonadField(name, registeredField)

    const count = _fieldUsageCount.get(name) ?? 0
    _fieldUsageCount.set(name, count + 1)

    if (config.params[name] !== undefined) {
      _params.set(name, config.params[name])
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
 * Создаёт/пересоздаёт Boundary со всеми бранами.
 */
export async function updateBoundary(): Promise<void> {
  const monadIds = Array.from(_monadIds)

  if (monadIds.length === 0) {
    _boundary.current?.clear()
    _boundary.current = null
    return
  }

  // Собираем глобальные поля в отсортированный массив кортежей
  const fields: [number, string, Field][] = []
  for (const [name, [index, field]] of _globalFields.entries()) {
    fields.push([index, name, field])
  }
  fields.sort((a, b) => a[0] - b[0])

  // Конвертируем params в кортежи для каждой монады
  const allBranes = monadIds.map((monadId) => {
    const monadParams = _monadParams.get(monadId)!
    const paramsTuples: [number, unknown][] = fields.map(([index, name, _]) => {
      return [index, monadParams[name]]
    })

    const monadSuperposition = _superpositions.get(monadId)!
    const boundarySuperposition = convertToNumeric(monadSuperposition, _fieldNameIndex)
    
    // Находим индекс начального состояния
    const initialStateIndex = boundarySuperposition.states.indexOf(_states.get(monadId)!)
    if (initialStateIndex === -1) {
      throw new Error(`State '${_states.get(monadId)}' not found in superposition`)
    }

    return {
      params: paramsTuples,
      initialStateIndex,
      superposition: boundarySuperposition,
    }
  })

  // Создаём Boundary если его нет, иначе очищаем существующий
  if (!_boundary.current) _boundary.current = new Boundary()
  else _boundary.current.clear()

  await _boundary.current.write({
    fields: fields.map(([index, name, field]) => [index, { ...field, name }]),
    branes: allBranes,
  })

  // Маппинги
  _uuidToIndex.clear()
  _indexToUuid.clear()
  monadIds.forEach((monadId, i) => {
    _uuidToIndex.set(monadId, i)
    _indexToUuid.set(i, monadId)
  })
}

/**
 * Обновляет поля браны и выполняет шаг эволюции.
 *
 * @param id - {@link MonadId} монады.
 * @param fields - Новые значения полей.
 * @throws {Error} Если Boundary не инициализирован. Вызовите updateBoundary() перед updateMonad().
 */
export async function updateMonad(id: MonadId, fields: Record<string, unknown>): Promise<void> {
  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Monad ${id} not found in boundary`)
  }

  // Обновляем локально (имена)
  for (const [name, value] of Object.entries(fields)) {
    _params.set(name, value)
  }

  // Обновляем params монады
  const monadParams = _monadParams.get(id)
  if (monadParams) {
    _monadParams.set(id, { ...monadParams, ...fields })
  }

  if (!_boundary.current) {
    throw new Error("Boundary not initialized")
  }

  // Конвертируем в кортежи
  for (const [name, value] of Object.entries(fields)) {
    const fieldId = _fieldNameIndex.get(name)
    if (fieldId === undefined) {
      throw new Error(`Field '${name}' not found`)
    }
    _boundary.current.updateBraneField(index, fieldId, value)
  }

  _boundary.current.step()

  // Получаем новые состояния и обрабатываем изменения
  const states = await _boundary.current.getStates()
  states.forEach((current, i) => {
    const monadId = _indexToUuid.get(i)
    if (!monadId) return

    const old = _states.get(monadId)
    if (old !== undefined && current !== old) {
      _states.set(monadId, current)

      // Автоматически выполняем действие для нового состояния
      const actions = _actions.get(monadId)
      const action = actions?.[current]
      if (action) {
        const params = _monadParams.get(monadId)
        if (params) {
          action(params)
        }
      }

      // Вызываем callback
      _onStateChange.current?.(monadId, old, current)
    }
  })
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
