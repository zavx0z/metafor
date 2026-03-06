// @ts-nocheck
/**
 * Реализация процессов
 * @module Processes
 */

import type { Schema } from "@zavx0z/context";
import type { Process, Processes } from "./old.t";
import type { Mass } from "../gravity/old.t";
import type { ProcessesSchema } from "../../metafor/meta/process.t";
import { ProcessType } from "../../metafor/meta/process.t";

export type { Process, Processes };

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
 *   const result = await process.action({ fields, mass, element })
 *   if (process.success) process.success({ update, data: result })
 * }
 * ```
 */
export function processesFromSchema<
  C extends Schema = Schema,
  𝛴 extends string = string,
  m extends Mass = Mass,
>(schema: ProcessesSchema): Processes<C, S, M> {
  const processes: Record<S, Process<ɸ, m>> = {} as Record<S, Process<ɸ, m>>;

  // Восстанавливаем процессы из схемы
  for (const [processName, processData] of Object.entries(schema)) {
    if (processData && typeof processData === "object") {
      const name = processName.replace(/\s/g, "_"); // TODO: параметр отладки
      // const name = self.meta + "_" + self.atom.replace(/\//g, "_") + "_" + processName.replace(/\s/g, "_") // TODO: параметр отладки

      // Определяем тип процесса: если есть поле "before" - это destroy, иначе action
      const processType: ProcessType =
        processData.type ||
        ("before" in processData ? ProcessType.FINALLY : ProcessType.ACTION);

      switch (processType) {
        case ProcessType.FINALLY:
          // Type guard для ParsedDestroy
          if ("before" in processData) {
            const destroyData = processData as Extract<
              typeof processData,
              { before: any }
            >;
            const destroyProcess: Process<ɸ, m> = {
              // Для destroy-процессов создаём action, который вызывает destroy
              type: processType,
              action: new Function(
                `//# sourceURL=${name}_destroy \n return ${destroyData.before.src}`,
              )() as any,
              // Добавляем метаданные
              ...(destroyData.label && { label: destroyData.label }),
              ...(destroyData.desc && { desc: destroyData.desc }),
            };
            processes[processName as S] = destroyProcess;
          }
          break;
        case ProcessType.ACTION:
          // Type guard для ParsedProcess
          if ("action" in processData) {
            const actionData = processData as Extract<
              typeof processData,
              { action: any }
            >;
            // Проверяем, является ли action.src путём к модулю (ESM формат)
            const isEsmModule = typeof actionData.action.src === "string" &&
              (actionData.action.src.startsWith("./") || actionData.action.src.startsWith("/"));

            // Обычный процесс
            const process: Process<ɸ, m> = {
              type: processType,
              // Восстанавливаем action функцию из строки или импортируем модуль
              action: isEsmModule
                ? async (params: any) => {
                    const mod = await import(actionData.action.src);
                    // Ищем первую экспортированную функцию (default или любую именованную)
                    const actionFn = mod.default || mod.action || mod.process || mod.load || mod.run || mod.execute
                    if (typeof actionFn !== "function") {
                      throw new Error(`Модуль "${actionData.action.src}" не экспортирует функцию`)
                    }
                    return actionFn(params)
                  }
                : new Function(
                    `//# sourceURL=${name}_action \n return ${actionData.action.src}`,
                  )() as any,
              // Восстанавливаем success функцию если есть
              ...(actionData.success && {
                success: new Function(
                  `//# sourceURL=${name}_success \n return ${actionData.success.src}`,
                )() as any,
              }),
              // Восстанавливаем error функцию если есть
              ...(actionData.error && {
                error: new Function(
                  `//# sourceURL=${name}_error \n return ${actionData.error.src}`,
                )() as any,
              }),
              // Добавляем метаданные
              ...(actionData.label && { label: actionData.label }),
              ...(actionData.desc && { desc: actionData.desc }),
            };
            processes[processName as S] = process;
          }
          break;
      }
    }
  }

  return {
    get: (name: S) => processes[name],
    has: (name: S) => name in processes,
    getAll: () => ({ ...processes }),
    names: () => Object.keys(processes),
  };
}
