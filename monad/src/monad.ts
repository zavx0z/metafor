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
let _metas: Map<string, MonadConfig> = new Map()
let _branes: Map<number, { id: string; brane: InternalBrane }> = new Map()
let _states: Map<number, string> = new Map()
let _onStateChange: ((index: number, old: string, newer: string) => void) | null = null
let _initialized = false

/**
 * Получает или создаёт Boundary.
 */
function _getBoundary(): Boundary {
  if (!_boundary) {
    _boundary = new Boundary()
  }
  return _boundary
}

// ==================== Функции ====================

/**
 * Создаёт и инициализирует монаду.
 *
 * @param config - Конфигурация монады.
 *
 * @example
 * ```typescript
 * createMonad({
 *   fields: { cmd: { type: "string" } },
 *   branes: [{ id, params, state, superposition }],
 *   actions: { "состояние": (params, update) => { ... } }
 * })
 * ```
 */
export function createMonad(config: MonadConfig): void {
  // Получаем id первой браны как id монады
  const monadId = config.branes[0]?.id || String(_metas.size)
  _metas.set(monadId, config)

  // Регистрируем браны с учётом существующих
  const startIndex = _branes.size
  config.branes.forEach((b, index) => {
    const globalIndex = startIndex + index
    _branes.set(globalIndex, {
      id: monadId,
      brane: {
        id: b.id,
        params: { ...b.params },
        state: b.state,
        superposition: b.superposition,
      },
    })
    _states.set(globalIndex, b.state)
  })
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
  _metas.delete(monadId)

  // Удаляем все браны этой монады
  for (const [index, { id }] of _branes.entries()) {
    if (id === monadId) {
      _branes.delete(index)
      _states.delete(index)
    }
  }

  // Если удалили последнюю монаду — сбрасываем всё
  if (_metas.size === 0) {
    _onStateChange = null
    _initialized = false
    _boundary = null
  }
}

/**
 * Инициализирует Boundary при первом вызове.
 */
async function _initBoundary(): Promise<Boundary> {
  if (!_initialized && _metas.size > 0) {
    // Собираем все браны из всех мет
    const allBranes: Array<{ id: string; params: Record<string, unknown>; state: string; superposition: any }> = []
    for (const meta of _metas.values()) {
      allBranes.push(...meta.branes)
    }

    // Получаем fields из первой меты
    const firstMeta = _metas.values().next().value
    if (firstMeta) {
      const boundary = _getBoundary()
      await boundary.init({ fields: firstMeta.fields, branes: allBranes })
      _initialized = true
    }
  }
  return _getBoundary()
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

  const boundary = await _initBoundary()

  // Обновляем params локально
  entry.brane.params = { ...entry.brane.params, ...fields }

  // Обновляем каждое поле в boundary
  for (const [field, value] of Object.entries(fields)) {
    boundary.updateBraneField(index, field, value)
  }

  // Выполняем шаг эволюции (GPU проверяет триггеры)
  boundary.step()

  // Получаем новые состояния
  const newStates = boundary.getStates()

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
  const boundary = await _initBoundary()
  boundary.updateBraneField(index, field, value)
  boundary.step()

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
  if (!entry || !_metas.has(entry.id)) return

  const meta = _metas.get(entry.id)
  if (!meta) return

  const action = meta.actions[state]
  if (!action) return

  const update = (boundaryId: string, params: Record<string, unknown>) => {
    // Обновляем params в бране
    entry.brane.params = { ...entry.brane.params, ...params }

    // Обновляем поля в boundary
    const boundary = _initBoundary()
    boundary.then((b) => {
      for (const [field, value] of Object.entries(params)) {
        b.updateBraneField(index, field, value)
      }

      // Выполняем шаг эволюции (GPU проверяет триггеры)
      b.step()

      // Получаем новые состояния и проверяем изменения
      const newStates = b.getStates()
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
