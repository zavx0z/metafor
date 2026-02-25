/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * @packageDocumentation
 */

import { Boundary } from "@metafor/boundary"
import type {
  ActionsStore,
  FieldsStore,
  IndexToUuidStore,
  MonadId,
  ParamsStore,
  StatesStore,
  SuperpositionsStore,
  UuidToIndexStore,
} from "./monad.t"
import type { Action, Actions, MonadConfig } from "./types"
import { convertAllFields } from "./field"

// ==================== Внутреннее состояние ====================

const _boundary: { current: Boundary | null } = { current: null }
const _fields: FieldsStore = new Map()
const _actions: ActionsStore = new Map()
const _params: ParamsStore = new Map()
const _superpositions: SuperpositionsStore = new Map()
const _states: StatesStore = new Map()
const _uuidToIndex: UuidToIndexStore = new Map()
const _indexToUuid: IndexToUuidStore = new Map()
const _onStateChange: { current: ((monadId: MonadId, old: string, current: string) => void) | null } = { current: null }

// Экспорт для тестов
export function _resetState(): void {
  _boundary.current = null
  _fields.clear()
  _actions.clear()
  _params.clear()
  _superpositions.clear()
  _states.clear()
  _uuidToIndex.clear()
  _indexToUuid.clear()
  _onStateChange.current = null
}

// ==================== Функции ====================

/**
 * Создаёт и регистрирует монаду.
 *
 * @param config - Конфигурация монады.
 * @returns UUID созданной монады.
 */
export function createMonad(config: MonadConfig): string {
  const id = crypto.randomUUID()
  _fields.set(id, config.fields)
  _actions.set(id, config.actions)
  _params.set(id, { ...config.params })
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
  _fields.delete(id)
  _actions.delete(id)
  _params.delete(id)
  _superpositions.delete(id)
  _states.delete(id)
  _uuidToIndex.delete(id)
}

/**
 * Создаёт/пересоздаёт Boundary со всеми бранами.
 */
export async function updateBoundary(): Promise<void> {
  // Получаем все ID монад
  const monadIds = Array.from(_params.keys())

  // Собираем все браны
  const allBranes = monadIds.map((monadId) => ({
    params: _params.get(monadId)!,
    state: _states.get(monadId)!,
    superposition: _superpositions.get(monadId)!,
  }))

  if (allBranes.length === 0) {
    _boundary.current?.clear()
    _boundary.current = null
    _uuidToIndex.clear()
    _indexToUuid.clear()
    return
  }

  // Преобразуем поля первой монады в готовые типы
  const firstFields = _fields.values().next().value
  if (!firstFields) {
    throw new Error("No monads registered")
  }
  const convertedFields = convertAllFields(firstFields)

  // Создаём Boundary если его нет, иначе очищаем существующий
  if (!_boundary.current) _boundary.current = new Boundary()
  else _boundary.current.clear()

  await _boundary.current.write({ fields: convertedFields, branes: allBranes })

  // Строим маппинги по индексу
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
  const params = _params.get(id)
  if (!params) {
    throw new Error(`Brane with id ${id} not found`)
  }

  // Boundary должен быть создан через updateBoundary()
  if (!_boundary.current) {
    throw new Error("Boundary not initialized. Call updateBoundary() first.")
  }

  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Brane ${id} not found in boundary`)
  }

  // Обновляем локально
  _params.set(id, { ...params, ...fields })

  // Обновляем в Boundary
  for (const [field, value] of Object.entries(fields)) {
    _boundary.current.updateBraneField(index, field, value)
  }

  // Шаг эволюции
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
        const params = _params.get(monadId)
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
