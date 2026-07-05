/**
 * Runtime-модуль для исполнения действий процессов.
 *
 * Предоставляет чистую функцию для выполнения действий с обработкой
 * синхронных/асинхронных результатов и нормализацией ошибок.
 *
 * @packageDocumentation
 */
import type { ExecuteParams } from "@metafor/types/bulk/weak"

/**
 * Выполняет действие процесса с обработкой синхронных и асинхронных результатов.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 *
 * @param params - Параметры выполнения
 * @returns Promise с результатом выполнения
 * @throws Error если действие не задано или произошла ошибка
 *
 * @example
 * ```typescript
 * const actionFn = await loadAction("./actions/my-action.ts")
 * const result = await executeProcess({
 *   action: actionFn,
 *   self: { atom: "test", path: "0", meta: "meta" },
 *   field: { count: { type: "number" } },
 *   value: { count: 42 },
 *   mass: { counter: 0 }
 * })
 * ```
 */
export function executeProcess(params: ExecuteParams): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    if (!params.action) {
      return reject(new Error("Нечего делать!"))
    }

    try {
      const result = params.action({
        self: params.self,
        field: params.field,
        value: params.value,
        mass: params.mass,
      })

      if (result instanceof Promise) {
        result.then((success) => resolve(success)).catch((error) => reject(error))
      } else {
        resolve(result)
      }
    } catch (error) {
      let normError: Error
      if (error instanceof Error) {
        normError = error
      } else if (typeof error === "string") {
        normError = new Error(error)
      } else {
        normError = new Error(error ? JSON.stringify(error) : "Ошибка без основания!")
      }
      reject(normError)
    }
  })
}
