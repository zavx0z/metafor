/**
 * Реализация процессов
 * @module Processes
 */

import type { Schema, Update } from "@zavx0z/context"
import type { ActionChain, ProcessesDeclaration, Process, ProcessChain, ActionParams, ProcessesType } from "./index.t"
import type { Core } from "../../core/index.t"
import { getSnapshotProcesses } from "./parser.ts"
export type { Process, ProcessesDeclaration } from "./index.t"
/**
 * Базовый класс для работы с процессами.
 * Содержит общую логику для управления процессами.
 *
 * @typeParam C - Схема контекста
 * @typeParam S - Строковые ключи состояний/процессов
 * @typeParam I - Тип ядра
 */
export abstract class ProcessesBase<C extends Schema, S extends string, I extends Core = {}> {
  protected processes: ProcessesType<C, S, I> = {} as ProcessesType<C, S, I>

  /**
   * Получает процесс по имени
   * @param name - имя процесса
   * @returns процесс или undefined
   */
  getProcess(name: S): Process<C, I> | undefined {
    return this.processes[name]
  }

  /**
   * Проверяет наличие процесса
   * @param name - имя процесса
   * @returns true если процесс существует
   */
  hasProcess(name: S): boolean {
    return name in this.processes
  }

  /**
   * Возвращает все процессы
   * @returns объект со всеми процессами
   */
  getAllProcesses(): ProcessesType<C, S, I> {
    return { ...this.processes }
  }

  /**
   * Возвращает имена всех процессов
   * @returns массив имен процессов
   */
  getProcessNames(): S[] {
    return Object.keys(this.processes) as S[]
  }

  /**
   * Возвращает количество процессов
   * @returns количество процессов
   */
  get size(): number {
    return Object.keys(this.processes).length
  }
}

/**
 * Основной класс для работы с процессами.
 * Позволяет создавать, управлять и выполнять процессы на основе схемы.
 *
 * @typeParam C - Схема контекста
 * @typeParam S - Строковые ключи состояний/процессов
 * @typeParam I - Тип ядра
 *
 * @example
 * const processes = new Processes(processesDeclaration)
 * processes.getProcess("login") // получение процесса
 * processes.hasProcess("login") // проверка наличия процесса
 */
export class Processes<C extends Schema, S extends string, I extends Core = {}> extends ProcessesBase<C, S, I> {
  private processesDeclaration: ProcessesDeclaration<C, S, I>

  constructor(processesDeclaration: ProcessesDeclaration<C, S, I>) {
    super()
    this.processesDeclaration = processesDeclaration
    this.createProcesses()
  }

  /**
   * Создает конфигурацию процессов из декларации
   */
  private createProcesses(): void {
    /**
     * Фабрика для создания process chain-объекта для каждого процесса.
     * Каждый вызов process возвращает chain API с методами action, success, error, getResult.
     */
    function process(config?: { title?: string; description?: string }): ProcessChain<C, I> {
      return {
        action: <Res>(fn: (params: ActionParams<C, I>) => Res | Promise<Res>): ActionChain<C, I, Res> => {
          // Храним текущие success/error handler'ы (последний вызов перезаписывает предыдущий)
          let successHandler: ((params: { update: Update<C>; data: Res }) => void) | undefined
          let errorHandler: ((params: { update: Update<C>; error: Error }) => void) | undefined
          // Chain API: каждый метод возвращает тот же объект, чтобы можно было строить цепочку
          const chain: ActionChain<C, I, Res> = {
            // Основная функция процесса
            action: fn,
            // Добавляет/перезаписывает success handler
            success(handler: (params: { update: Update<C>; data: Res }) => void) {
              successHandler = handler
              return chain
            },
            // Добавляет/перезаписывает error handler
            error(handler: (params: { update: Update<C>; error: Error }) => void) {
              errorHandler = handler
              return chain
            },
            // Собирает итоговый объект: только те обработчики, которые были явно заданы
            getResult() {
              const result: Process<C, I, Res> = {
                action: (params) => fn({ context: params.context, core: params.core, element: params.element }),
              }
              if (successHandler) result.success = successHandler
              if (errorHandler) result.error = errorHandler
              if (config?.title) result.title = config.title
              if (config?.description) result.description = config.description
              return result
            },
          }
          return chain
        },
      }
    }

    // Вызываем builder, передавая фабрику process. На выходе получаем объект, где значения — chain-объекты.
    const raw = this.processesDeclaration(process)
    // Для каждого ключа вызываем getResult, чтобы получить финальный объект с action, success, error, title, description.
    const result: ProcessesType<C, S, I> = {} as ProcessesType<C, S, I>
    for (const key in raw) {
      if (raw[key]) {
        result[key] = raw[key]!.getResult()
      }
    }
    // Возвращаем actionsConfig: ключи — имена процессов, значения — объекты с action, success, error, title, description
    this.processes = result
  }

  /**
   * Создает снимок процессов для сериализации
   * @returns сериализованный снимок процессов
   */
  toSnapshot(): Record<string, any> {
    return getSnapshotProcesses(this.processesDeclaration) ?? {}
  }
  get snapshot() {
    if (!Object.keys(this.processes).length) return {} as Record<string, any>
    return { processes: this.toSnapshot() }
  }
}

/**
 * Десериализует процессы из snapshot и возвращает объект с функциями для работы с процессами.
 *
 * @param snapshot - сериализованный снимок процессов
 * @returns объект с функциями для работы с процессами
 *
 * @example
 * ```ts
 * const processes = deserializeProcesses(snapshot)
 * const process = processes.getProcess("login")
 * if (process) {
 *   const result = await process.action({ context, core, element })
 *   if (process.success) process.success({ update, data: result })
 * }
 * ```
 */
export function deserializeProcesses<C extends Schema, S extends string, I extends Core = {}>(
  snapshot: Record<string, any>
): {
  getProcess: (name: S) => Process<C, I> | undefined
  hasProcess: (name: S) => boolean
  getAllProcesses: () => Record<string, Process<C, I>>
  getProcessNames: () => string[]
} {
  const processes: Record<string, Process<C, I>> = {}

  // Восстанавливаем процессы из snapshot
  for (const [processName, processData] of Object.entries(snapshot)) {
    if (processData && typeof processData === "object") {
      const process: Process<C, I> = {
        // Восстанавливаем action функцию из строки
        action: new Function("return " + processData.action.src)() as any,
        // Восстанавливаем success функцию если есть
        ...(processData.success && {
          success: new Function("return " + processData.success.src)() as any,
        }),
        // Восстанавливаем error функцию если есть
        ...(processData.error && {
          error: new Function("return " + processData.error.src)() as any,
        }),
        // Добавляем метаданные
        ...(processData.title && { title: processData.title }),
        ...(processData.description && { description: processData.description }),
      }
      processes[processName] = process
    }
  }

  return {
    getProcess: (name: S) => processes[name as string],
    hasProcess: (name: S) => name in processes,
    getAllProcesses: () => ({ ...processes }),
    getProcessNames: () => Object.keys(processes),
  }
}
