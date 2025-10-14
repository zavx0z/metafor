/**
 * Реализация процессов
 * @module Processes
 */

import type { Schema } from "@zavx0z/context"
import type { Process, Processes } from "./processes.t"
import type { Core } from "../force/gravity.t"
import type { ProcessesSchema } from "../schema/process.t"
import type { Self } from "../metafor.t"
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
      const name = processName.replace(/\s/g, "_") // TODO: параметр отладки
      // const name = self.meta + "_" + self.actor.replace(/\//g, "_") + "_" + processName.replace(/\s/g, "_") // TODO: параметр отладки
      const process: Process<C, I> = {
        // Восстанавливаем action функцию из строки
        action: new Function(`//# sourceURL=${name}_action \n return ${processData.action.src}`)() as any,
        // Восстанавливаем success функцию если есть
        ...(processData.success && {
          success: new Function(`//# sourceURL=${name}_success \n return ${processData.success.src}`)() as any,
        }),
        // Восстанавливаем error функцию если есть
        ...(processData.error && {
          error: new Function(`//# sourceURL=${name}_error \n return ${processData.error.src}`)() as any,
        }),
        // Добавляем метаданные
        ...(processData.label && { label: processData.label }),
        ...(processData.desc && { desc: processData.desc }),
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
