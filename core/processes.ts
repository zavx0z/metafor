/**
 * Реализация процессов
 * @module Processes
 */

import type { Schema } from "@zavx0z/context"
import type { Process } from "./processes.t"
import type { Core } from "./index.t"
export type { Process } from "./processes.t"

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
export function processesFromSchema<C extends Schema, S extends string, I extends Core = {}>(
  schema: Record<string, any>
): {
  getProcess: (name: S) => Process<C, I> | undefined
  hasProcess: (name: S) => boolean
  getAllProcesses: () => Record<string, Process<C, I>>
  getProcessNames: () => string[]
} {
  const processes: Record<string, Process<C, I>> = {}

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
