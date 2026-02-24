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
let _branes: Map<string, InternalBrane> = new Map()  // UUID → Brane
let _states: Map<string, string> = new Map()         // UUID → State
let _onStateChange: ((monadId: string, old: string, newer: string) => void) | null = null

/**
 * Создаёт Boundary с текущими бранами.
 * Возвращает Boundary и маппинг UUID → индекс.
 */
async function _createBoundary(): Promise<{ boundary: Boundary; uuidToIndex: Map<string, number>; indexToUuid: Map<number, string> }> {
  // Собираем все браны с актуальными params
  const allBranes: Array<{ id: string; params: Record<string, unknown>; state: string; superposition: any }> = []
  const uuidToIndex = new Map<string, number>()
  const indexToUuid = new Map<number, string>()
  
  let index = 0
  for (const [id, brane] of _branes.entries()) {
    allBranes.push({
      id,
      params: brane.params,
      state: _states.get(id) || brane.state,
      superposition: brane.superposition,
    })
    uuidToIndex.set(id, index)
    indexToUuid.set(index, id)
    index++
  }

  // Получаем fields из первой монады
  const firstMonad = _monads.values().next().value
  if (!firstMonad) {
    throw new Error("No monads registered")
  }

  const boundary = new Boundary()
  await boundary.init({ fields: firstMonad.fields, branes: allBranes })
  return { boundary, uuidToIndex, indexToUuid }
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
  _branes.set(monadId, {
    id: monadId,
    params: { ...config.params },
    state: config.state,
    superposition: config.superposition,
  })
  _states.set(monadId, config.state)

  return monadId
}

/**
 * Удаляет монаду по id и очищает состояние.
 *
 * @param monadId - Идентификатор монады (UUID).
 *
 * @example
 * ```typescript
 * deleteMonad("550e8400-e29b-41d4-a716-446655440000")
 * ```
 */
export function deleteMonad(monadId: string): void {
  _monads.delete(monadId)
  _branes.delete(monadId)
  _states.delete(monadId)

  // Если удалили последнюю монаду — сбрасываем всё
  if (_monads.size === 0) {
    _onStateChange = null
    _boundary = null
  }
}

/**
 * Обновляет поля браны и проверяет триггеры.
 *
 * @param monadId - UUID монады.
 * @param fields - Объект с новыми значениями полей.
 *
 * @example
 * ```typescript
 * updateMonad(monadId, { cmd: "git status", count: 5 })
 * ```
 */
export async function updateMonad(monadId: string, fields: Record<string, unknown>): Promise<void> {
  const brane = _branes.get(monadId)
  if (!brane) {
    throw new Error(`Brane with id ${monadId} not found`)
  }

  // Пересоздаём Boundary с актуальными данными
  const { boundary, uuidToIndex, indexToUuid } = await _createBoundary()
  _boundary = boundary

  const index = uuidToIndex.get(monadId)
  if (index === undefined) {
    throw new Error(`Brane ${monadId} not found in boundary`)
  }

  // Обновляем params локально
  brane.params = { ...brane.params, ...fields }

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
      const id = indexToUuid.get(i)
      if (!id) return
      const oldState = _states.get(id)
      if (oldState !== undefined && newState !== oldState) {
        _states.set(id, newState)
        _onStateChange?.(id, oldState, newState)  // Передаём UUID, а не индекс
      }
    })
  })
}

/**
 * Обновляет поле в boundary (без обновления локальных params).
 *
 * @param monadId - UUID монады.
 * @param field - Имя поля.
 * @param value - Новое значение.
 *
 * @example
 * ```typescript
 * updateBoundary(monadId, "cmd", "git status")
 * ```
 */
export async function updateBoundary(monadId: string, field: string, value: unknown): Promise<void> {
  // Пересоздаём Boundary с актуальными данными
  const { boundary, uuidToIndex, indexToUuid } = await _createBoundary()
  _boundary = boundary

  const index = uuidToIndex.get(monadId)
  if (index === undefined) {
    throw new Error(`Brane ${monadId} not found in boundary`)
  }

  _boundary.updateBraneField(index, field, value)
  _boundary.step()

  const newStates = _boundary.getStates()
  newStates.then((states) => {
    states.forEach((newState, i) => {
      const id = indexToUuid.get(i)
      if (!id) return
      const oldState = _states.get(id)
      if (oldState !== undefined && newState !== oldState) {
        _states.set(id, newState)
        _onStateChange?.(id, oldState, newState)
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
 * onStateChange((monadId, oldState, newState) => {
 *   console.log(`State changed: ${oldState} → ${newState}`)
 * })
 * ```
 */
export function onStateChange(callback: (monadId: string, old: string, newer: string) => void): void {
  _onStateChange = callback
}

/**
 * Выполняет действие для состояния.
 *
 * @param monadId - UUID монады.
 * @param state - Имя состояния.
 */
export function execute(monadId: string, state: string): void {
  const brane = _branes.get(monadId)
  if (!brane) return

  const monad = _monads.get(monadId)
  if (!monad) return

  const action = monad.actions[state]
  if (!action) return

  const update = (params: Record<string, unknown>) => {
    // Обновляем params в бране
    brane.params = { ...brane.params, ...params }

    // Пересоздаём Boundary с актуальными данными
    _createBoundary().then(({ boundary, uuidToIndex, indexToUuid }) => {
      _boundary = boundary

      const index = uuidToIndex.get(monadId)
      if (index === undefined) return

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
          const id = indexToUuid.get(i)
          if (!id) return
          const oldState = _states.get(id)
          if (oldState !== undefined && newState !== oldState) {
            _states.set(id, newState)
            _onStateChange?.(id, oldState, newState)
          }
        })
      })
    })
  }

  // Выполняем действие
  action(brane.params, update)
}
