/**
 * Реализация процессов
 * @module Processes
 */

import type { Schema } from "@zavx0z/context"
import type { Process, Processes } from "./processes.t"
import type { Core } from "../actor.t"
import type { ProcessesSchema } from "../schema/process.t"
export type { Process, Processes } from "./processes.t"

/**
 * Десериализует процессы из схемы и возвращает объект с функциями для работы с процессами.
 *
 * @param schema - схема процессов
 * @returns объект с функциями для работы с процессами
 *
 * @example
 * ```ts
 * const processes = deserializeProcesses(schema)
 * const process = processes.getProcess("processName")
 * if (process) {
 *   const result = await process.action({ context, core, element })
 *   if (process.success) process.success({ update, data: result })
 * }
 * ```
 */
export function processesFromSchema<C extends Schema = Schema, S extends string = string, I extends Core = Core>(
  schema: ProcessesSchema
): Processes<C, S, I> {
  const processes: Record<S, Process<C, I>> = {} as Record<S, Process<C, I>>

  // Восстанавливаем процессы из схемы
  for (const [processName, processData] of Object.entries(schema)) {
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
      processes[processName as S] = process
    }
  }

  return {
    getProcess: (name: S) => processes[name],
    hasProcess: (name: S) => name in processes,
    getAllProcesses: () => ({ ...processes }),
    getProcessNames: () => Object.keys(processes),
  }
}
