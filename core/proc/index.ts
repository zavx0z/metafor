/**
 * Реализация процессов
 * @module Processes
 */

import type { ContextSchema, ExtractValues } from "../context"
import type {
  ActionChain,
  ProcessesDeclaration,
  Process,
  ProcessChain,
  ActionParams,
  ProcessesType,
} from "./index.t"
import type { Core } from "../../core/index.t"
import { getSnapshotProcesses } from "./parser.ts"
export type { Process } from "./index.t"
/**
 * Базовый класс для работы с процессами.
 * Содержит общую логику для управления процессами.
 *
 * @typeParam C - Схема контекста
 * @typeParam S - Строковые ключи состояний/процессов
 * @typeParam I - Тип ядра
 */
export abstract class ProcessesBase<C extends ContextSchema, S extends string, I extends Core = {}> {
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
export class Processes<C extends ContextSchema, S extends string, I extends Core = {}> extends ProcessesBase<C, S, I> {
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
          let successHandler:
            | ((params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void)
            | undefined
          let errorHandler:
            | ((params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void)
            | undefined
          // Chain API: каждый метод возвращает тот же объект, чтобы можно было строить цепочку
          const chain: ActionChain<C, I, Res> = {
            // Основная функция процесса
            action: fn,
            // Добавляет/перезаписывает success handler
            success(handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; data: Res }) => void) {
              successHandler = handler
              return chain
            },
            // Добавляет/перезаписывает error handler
            error(handler: (params: { update: (values: Partial<ExtractValues<C>>) => void; error: Error }) => void) {
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
    return getSnapshotProcesses(this.processesDeclaration)
  }
}

/**
 * Класс для восстановления процессов из snapshot.
 * Используется для десериализации процессов.
 *
 * @typeParam C - Схема контекста
 * @typeParam S - Строковые ключи состояний/процессов
 * @typeParam I - Тип ядра
 */
export class ProcessesClone<C extends ContextSchema, S extends string, I extends Core = {}> extends ProcessesBase<
  C,
  S,
  I
> {
  constructor() {
    super()
  }

  /**
   * Создает экземпляр ProcessesClone из snapshot
   * @param snapshot - снимок процессов
   * @returns экземпляр ProcessesClone
   */
  static fromSnapshot<C extends ContextSchema, S extends string, I extends Core = {}>(
    snapshot: Record<string, any>
  ): ProcessesClone<C, S, I> {
    const clone = new ProcessesClone<C, S, I>()
    // Здесь можно добавить логику восстановления процессов из snapshot
    // Пока что просто возвращаем пустой clone
    return clone
  }
}
