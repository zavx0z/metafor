/**
 * Monad — минимальный конечный автомат.
 *
 * Управляет состояниями бран, выполняет действия при изменении состояния.
 *
 * @example
 * ```typescript
 * const monad = await Monad.create(device, {
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

/**
 * Минимальная монада — конечный автомат.
 */
export class Monad {
  private boundary: Boundary
  private config: MonadConfig
  private states: string[]
  private branes: InternalBrane[]

  /**
   * Callback на изменение состояния.
   *
   * @param braneIndex - Индекс браны.
   * @param oldState - Предыдущее состояние.
   * @param newState - Новое состояние.
   */
  public onStateChange?: (braneIndex: number, oldState: string, newState: string) => void

  private constructor(config: MonadConfig, boundary: Boundary) {
    this.config = config
    this.boundary = boundary
    this.branes = config.branes.map((b) => ({
      id: b.id,
      params: { ...b.params },
      state: b.state,
      superposition: b.superposition,
    }))
    this.states = this.branes.map((b) => b.state)
  }

  /**
   * Создаёт и инициализирует монаду.
   *
   * @param device - GPU device.
   * @param config - Конфигурация монады.
   * @returns Промис с экземпляром Monad.
   *
   * @example
   * ```typescript
   * const monad = await Monad.create(device, {
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
   * ```
   */
  static async create(device: GPUDevice, config: MonadConfig): Promise<Monad> {
    const boundary = new Boundary(device)
    await boundary.init({ fields: config.fields, branes: config.branes })

    const monad = new Monad(config, boundary)
    return monad
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
    const brane = this.branes[braneIndex]
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
    const action = this.config.actions[state]
    if (!action) return

    const brane = this.branes[braneIndex]
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
