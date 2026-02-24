/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * @packageDocumentation
 */

import { Boundary, type FieldsDefinition, type Superposition } from "@metafor/boundary"
import type { Action, Actions } from "./types"

/**
 * Внутреннее представление браны.
 */
interface InternalBrane {
  params: Record<string, unknown>
  state: string
  superposition: Superposition
}

/**
 * Конфигурация монады.
 */
export interface MonadConfig {
  fields: FieldsDefinition
  params: Record<string, unknown>
  state: string
  superposition: Superposition
  actions: Actions
}

// ==================== Внутреннее состояние ====================

let _boundary: Boundary | null = null
let _monads: Map<string, MonadConfig> = new Map()
let _branes: Map<string, InternalBrane> = new Map()
let _states: Map<string, string> = new Map()
let _uuidToIndex: Map<string, number> = new Map()
let _indexToUuid: Map<number, string> = new Map()
let _onStateChange: ((monadId: string, old: string, current: string) => void) | null = null

// Экспорт для тестов
export function _resetState(): void {
  _boundary = null
  _monads.clear()
  _branes.clear()
  _states.clear()
  _uuidToIndex.clear()
  _indexToUuid.clear()
  _onStateChange = null
}

// ==================== Вспомогательные функции ====================

async function _syncStatesFromBoundary(): Promise<void> {
  const boundary = _boundary
  if (!boundary) return

  const states = await boundary.getStates()
  states.forEach((current, i) => {
    const id = _indexToUuid.get(i)
    if (!id) return
    const old = _states.get(id)
    if (old !== undefined && current !== old) {
      _states.set(id, current)
      _onStateChange?.(id, old, current)
    }
  })
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
  _monads.set(id, config)
  _branes.set(id, {
    params: { ...config.params },
    state: config.state,
    superposition: config.superposition,
  })
  _states.set(id, config.state)
  return id
}

/**
 * Удаляет монаду.
 *
 * @param id - UUID монады.
 */
export function deleteMonad(id: string): void {
  _monads.delete(id)
  _branes.delete(id)
  _states.delete(id)
  _uuidToIndex.delete(id)
}

/**
 * Создаёт/пересоздаёт Boundary со всеми бранами.
 */
export async function updateBoundary(): Promise<void> {
  // Собираем все браны
  const allBranes = Array.from(_branes.entries()).map(([id, brane]) => ({
    id,
    params: brane.params,
    state: _states.get(id) || brane.state,
    superposition: brane.superposition,
  }))

  if (allBranes.length === 0) {
    _boundary = null
    _uuidToIndex.clear()
    _indexToUuid.clear()
    return
  }

  // Получаем fields из первой монады
  const firstMonad = _monads.values().next().value
  if (!firstMonad) {
    throw new Error("No monads registered")
  }

  // Создаём новый Boundary
  _boundary = new Boundary()
  await _boundary.init({ fields: firstMonad.fields, branes: allBranes })

  // Строим маппинги
  _uuidToIndex.clear()
  _indexToUuid.clear()
  allBranes.forEach((brane, i) => {
    _uuidToIndex.set(brane.id, i)
    _indexToUuid.set(i, brane.id)
  })
}

/**
 * Обновляет поля браны и выполняет шаг эволюции.
 *
 * @param id - UUID монады.
 * @param fields - Новые значения полей.
 */
export async function updateMonad(id: string, fields: Record<string, unknown>): Promise<void> {
  const brane = _branes.get(id)
  if (!brane) {
    throw new Error(`Brane with id ${id} not found`)
  }

  // Создаём Boundary если не создан
  if (!_boundary) {
    await updateBoundary()
  }

  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Brane ${id} not found in boundary`)
  }

  // Обновляем локально
  brane.params = { ...brane.params, ...fields }

  // Обновляем в Boundary
  for (const [field, value] of Object.entries(fields)) {
    _boundary!.updateBraneField(index, field, value)
  }

  // Шаг эволюции
  _boundary!.step()

  // Синхронизация состояний
  await _syncStatesFromBoundary()
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
export function onStateChange(callback: (monadId: string, old: string, current: string) => void): void {
  _onStateChange = callback
}

/**
 * Выполняет действие для состояния (чистая функция).
 *
 * @param id - UUID монады.
 * @param state - Имя состояния.
 */
export function execute(id: string, state: string): void {
  const monad = _monads.get(id)
  if (!monad) return

  const action = monad.actions[state]
  if (!action) return

  const brane = _branes.get(id)
  if (!brane) return

  // Чистая функция - никаких обновлений
  action(brane.params)
}
