/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * Управляет состояниями бран, выполняет действия при изменении состояния.
 *
 * @example
 * ```typescript
 * await createMonad({
 *   fields: { cmd: { type: "string" } },
 *   branes: [{
 *     id: "git-1",
 *     params: { cmd: "" },
 *     state: "ожидание",
 *     superposition: {
 *       "ожидание": { "выполнение": { cmd: { null: false } } },
 *       "выполнение": null
 *     }
 *   }],
 *   actions: {
 *     "выполнение": (params, update) => {
 *       exec(params.cmd)
 *       update("git-1", { cmd: "" })
 *     }
 *   }
 * })
 *
 * onStateChange((index, oldState, newState) => {
 *   console.log(`State changed: ${oldState} → ${newState}`)
 * })
 *
 * updateMonad(0, { cmd: "git status" })
 * ```
 *
 * @packageDocumentation
 */

import { Boundary, type Superposition } from "@metafor/boundary"
import type { MonadConfig, Update } from "./types"

/**
 * Внутреннее представление браны в Monad.
 */
interface InternalBrane {
  id: string
  params: Record<string, unknown>
  state: string
  superposition: Superposition
}

// ==================== Внутреннее состояние ====================

let _boundary: Boundary | null = null
let _monads: Map<string, MonadConfig> = new Map()
let _branes: Map<number, { id: string; brane: InternalBrane }> = new Map()
let _states: Map<number, string> = new Map()
let _onStateChange: ((index: number, old: string, newer: string) => void) | null = null

/**
 * Создаёт Boundary с текущими бранами.
 */
async function _createBoundary(): Promise<Boundary> {
  // Собираем все браны с актуальными params
  const allBranes: Array<{ id: string; params: Record<string, unknown>; state: string; superposition: any }> = []
  
  for (const [index, { brane }] of _branes.entries()) {
    allBranes.push({
      id: brane.id,
      params: brane.params,
      state: _states.get(index) || brane.state,
      superposition: brane.superposition,
    })
  }

  // Получаем fields из первой монады
  const firstMonad = _monads.values().next().value
  if (!firstMonad) {
    throw new Error("No monads registered")
  }

  const boundary = new Boundary()
  await boundary.init({ fields: firstMonad.fields, branes: allBranes })
  return boundary
}

// ==================== Функции ====================

/**
 * Создаёт и инициализирует монаду.
 *
 * @param config - Конфигурация монады (одна брана).
 * @returns UUID созданной монады.
 *
 * @example
 * ```typescript
 * const monadId = createMonad({
 *   fields: { cmd: { type: "string" } },
 *   params: { cmd: "" },
 *   state: "ожидание",
 *   superposition: {
 *     "ожидание": { "выполнение": { cmd: { null: false } } },
 *     "выполнение": null
 *   },
 *   actions: { "состояние": (params, update) => { ... } }
 * })
 * ```
 */
export function createMonad(config: MonadConfig): string {
  // Генерируем UUID для монады (он же ID браны)
  const monadId = crypto.randomUUID()
  _monads.set(monadId, config)

  // Регистрируем брану (ID = UUID монады)
  const index = _branes.size
  _branes.set(index, {
    id: monadId,
    brane: {
      id: monadId,
      params: { ...config.params },
      state: config.state,
      superposition: config.superposition,
    },
  })
  _states.set(index, config.state)

  return monadId
}

/**
 * Удаляет монаду по id и очищает состояние.
 *
 * @param monadId - Идентификатор монады.
 *
 * @example
 * ```typescript
 * deleteMonad("git-1")
 * ```
 */
export function deleteMonad(monadId: string): void {
  _monads.delete(monadId)

  // Удаляем все браны этой монады
  for (const [index, { id }] of _branes.entries()) {
    if (id === monadId) {
      _branes.delete(index)
      _states.delete(index)
    }
  }

  // Если удалили последнюю монаду — сбрасываем всё
  if (_monads.size === 0) {
    _onStateChange = null
    _boundary = null
  }
}

/**
 * Обновляет поля браны и проверяет триггеры.
 *
 * @param index - Индекс браны.
 * @param fields - Объект с новыми значениями полей.
 *
 * @example
 * ```typescript
 * updateMonad(0, { cmd: "git status", count: 5 })
 * ```
 */
export async function updateMonad(index: number, fields: Record<string, unknown>): Promise<void> {
  const entry = _branes.get(index)
  if (!entry) {
    throw new Error(`Brane with index ${index} not found`)
  }

  // Пересоздаём Boundary с актуальными данными
  _boundary = await _createBoundary()

  // Обновляем params локально
  entry.brane.params = { ...entry.brane.params, ...fields }

  // Обновляем каждое поле в boundary
  for (const [field, value] of Object.entries(fields)) {
    _boundary.updateBraneField(index, field, value)
  }

  // Выполняем шаг эволюции (GPU проверяет триггеры)
  _boundary.step()

  // Получаем новые состояния
  const newStates = _boundary.getStates()

  // Проверяем изменения и вызываем onStateChange
  newStates.then((states) => {
    states.forEach((newState, i) => {
      const oldState = _states.get(i)
      if (oldState !== undefined && newState !== oldState) {
        _states.set(i, newState)
        _onStateChange?.(i, oldState, newState)
      }
    })
  })
}

/**
 * Обновляет поле в boundary (без обновления локальных params).
 *
 * @param index - Индекс браны.
 * @param field - Имя поля.
 * @param value - Новое значение.
 *
 * @example
 * ```typescript
 * updateBoundary(0, "cmd", "git status")
 * ```
 */
export async function updateBoundary(index: number, field: string, value: unknown): Promise<void> {
  // Пересоздаём Boundary с актуальными данными
  _boundary = await _createBoundary()

  _boundary.updateBraneField(index, field, value)
  _boundary.step()

  const newStates = _boundary.getStates()
  newStates.then((states) => {
    states.forEach((newState, i) => {
      const oldState = _states.get(i)
      if (oldState !== undefined && newState !== oldState) {
        _states.set(i, newState)
        _onStateChange?.(i, oldState, newState)
      }
    })
  })
}

/**
 * Устанавливает callback на изменение состояния.
 *
 * @param callback - Функция обратного вызова.
 *
 * @example
 * ```typescript
 * onStateChange((index, oldState, newState) => {
 *   console.log(`State changed: ${oldState} → ${newState}`)
 * })
 * ```
 */
export function onStateChange(callback: (index: number, old: string, newer: string) => void): void {
  _onStateChange = callback
}

/**
 * Выполняет действие для состояния.
 *
 * @param index - Индекс браны.
 * @param state - Имя состояния.
 */
export function execute(index: number, state: string): void {
  const entry = _branes.get(index)
  if (!entry) return

  const monadId = entry.id
  const monad = _monads.get(monadId)
  if (!monad) return

  const action = monad.actions[state]
  if (!action) return

  const update = (params: Record<string, unknown>) => {
    // Обновляем params в бране
    entry.brane.params = { ...entry.brane.params, ...params }

    // Пересоздаём Boundary с актуальными данными
    _createBoundary().then((boundary) => {
      _boundary = boundary

      // Обновляем поля в boundary
      for (const [field, value] of Object.entries(params)) {
        boundary.updateBraneField(index, field, value)
      }

      // Выполняем шаг эволюции (GPU проверяет триггеры)
      boundary.step()

      // Получаем новые состояния и проверяем изменения
      const newStates = boundary.getStates()
      newStates.then((states) => {
        states.forEach((newState, i) => {
          const oldState = _states.get(i)
          if (oldState !== undefined && newState !== oldState) {
            _states.set(i, newState)
            _onStateChange?.(i, oldState, newState)
          }
        })
      })
    })
  }

  // Выполняем действие
  action(entry.brane.params, update)
}
