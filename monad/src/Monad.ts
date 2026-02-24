/**
 * Monad — минимальный конечный автомат.
 *
 * Управляет состояниями бран, выполняет действия при изменении состояния.
 *
 * @example
 * ```typescript
 * const monad = new Monad()
 * await monad.create({
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
 * monad.onStateChange = (index, oldState, newState) => {
 *   console.log(`State changed: ${oldState} → ${newState}`)
 * }
 *
 * monad.updateField(0, { cmd: "git status" })
 * ```
 *
 * @packageDocumentation
 */

import { Boundary, type DebugOptions, type Superposition } from "@metafor/boundary"
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

/**
 * Минимальная монада — конечный автомат (реестр конфигураций).
 */
export class Monad {
  private boundary: Boundary
  private config: MonadConfig | null = null
  private states: string[] = []
  private branes: InternalBrane[] = []

  /**
   * Callback на изменение состояния.
   *
   * @param braneIndex - Индекс браны.
   * @param oldState - Предыдущее состояние.
   * @param newState - Новое состояние.
   */
  public onStateChange?: (braneIndex: number, oldState: string, newState: string) => void

  /**
   * Создаёт экземпляр монады.
   *
   * @param options - Опции debug.
   *
   * @example
   * ```typescript
   * const monad = new Monad()
   * ```
   */
  constructor(options?: { debug?: DebugOptions }) {
    this.boundary = new Boundary(options)
  }

  /**
   * Регистрирует конфигурацию в реестре.
   *
   * @param config - Конфигурация монады.
   * @returns Промис завершения инициализации.
   *
   * @example
   * ```typescript
   * const monad = new Monad()
   * await monad.create({
   *   fields: { cmd: { type: "string" } },
   *   branes: [{ id, params, state, superposition }],
   *   actions: { "состояние": (params, update) => { ... } }
   * })
   * ```
   */
  async create(config: MonadConfig): Promise<void> {
    await this.boundary.init({ fields: config.fields, branes: config.branes })
    this.config = config
    this.branes = config.branes.map((b) => ({
      id: b.id,
      params: { ...b.params },
      state: b.state,
      superposition: b.superposition,
    }))
    this.states = this.branes.map((b) => b.state)
  }

  private getBrane(idx: number): InternalBrane | undefined {
    return this.branes[idx]
  }

  /**
   * Обновляет поля браны и проверяет триггеры.
   *
   * @param braneIndex - Индекс браны в массиве.
   * @param fields - Объект с новыми значениями полей.
   *
   * @example
   * ```typescript
   * monad.updateField(0, { cmd: "git status", count: 5 })
   * ```
   */
  public updateField(braneIndex: number, fields: Record<string, unknown>): void {
    const brane = this.getBrane(braneIndex)
    if (!brane) {
      throw new Error(`Brane with index ${braneIndex} not found`)
    }

    // Обновляем params локально
    brane.params = { ...brane.params, ...fields }

    // Обновляем каждое поле в boundary
    for (const [field, value] of Object.entries(fields)) {
      this.boundary.updateBraneField(braneIndex, field, value)
    }

    // Выполняем шаг эволюции (GPU проверяет триггеры)
    this.boundary.step()

    // Получаем новые состояния
    const newStates = this.boundary.getStates()

    // Проверяем изменения и вызываем onStateChange
    newStates.then((states) => {
      states.forEach((newState, index) => {
        const oldState = this.states[index]
        if (oldState !== undefined && newState !== oldState) {
          this.states[index] = newState
          this.onStateChange?.(index, oldState, newState)
        }
      })
    })
  }

  /**
   * Выполняет действие для состояния.
   *
   * @param braneIndex - Индекс браны.
   * @param state - Имя состояния.
   *
   * @internal
   */
  public execute(braneIndex: number, state: string): void {
    if (!this.config) return

    const action = this.config.actions[state]
    if (!action) return

    const brane = this.getBrane(braneIndex)
    if (!brane) return

    const update: Update = (boundaryId, params) => {
      // Обновляем params в бране
      brane.params = { ...brane.params, ...params }

      // Обновляем поля в boundary
      for (const [field, value] of Object.entries(params)) {
        this.boundary.updateBraneField(braneIndex, field, value)
      }

      // Выполняем шаг эволюции (GPU проверяет триггеры)
      this.boundary.step()

      // Получаем новые состояния и проверяем изменения
      const newStates = this.boundary.getStates()
      newStates.then((states) => {
        states.forEach((newState, index) => {
          const oldState = this.states[index]
          if (oldState !== undefined && newState !== oldState) {
            this.states[index] = newState
            this.onStateChange?.(index, oldState, newState)
          }
        })
      })
    }

    // Выполняем действие
    action(brane.params, update)
  }
}
