/**
 * Runtime-модуль для загрузки модулей действий процессов.
 *
 * Предоставляет функцию для динамической загрузки ESM-модулей и извлечения функций действий.
 * Загружает модули через import() и валидирует экспортированные функции.
 *
 * @packageDocumentation
 */
import type { Mass, Fields } from "../../index.ts"
import type { ProcessConfig, ActionFn } from "./load.t"

/**
 * Загружает модуль действия и возвращает экспортированную функцию.
 *
 * @param config - Конфигурация процесса (src и importSpecifier) или путь к модулю
 * @returns Функция действия
 * @throws Error если модуль не экспортирует валидную функцию
 *
 * @example
 * ```typescript
 * // Загрузка с явным спецификатором
 * const actionFn = await loadAction({
 *   src: "./actions/loader.ts",
 *   importSpecifier: "default"
 * })
 *
 * // Загрузка с путем-строкой (используется default экспорт)
 * const actionFn = await loadAction("./actions/loader.ts")
 * ```
 */
export async function loadAction<ɸ extends Fields, m extends Mass>(
  config: ProcessConfig | string,
): Promise<ActionFn<ɸ, m, any>> {
  // Нормализация конфигурации
  const moduleSrc = typeof config === "string" ? config : config.src
  const importSpecifier = typeof config === "string" ? undefined : config.importSpecifier

  // Динамический импорт модуля действия
  const mod = await import(moduleSrc)

  // Получение экспортированной функции
  let actionFn: ActionFn<ɸ, m, any> | undefined

  if (importSpecifier) {
    actionFn = mod[importSpecifier]
    if (typeof actionFn !== "function") {
      const availableExports = Object.keys(mod).filter((key) => typeof mod[key] === "function")
      throw new Error(
        `Модуль "${moduleSrc}" не экспортирует функцию "${importSpecifier}". ` +
          `Доступные экспорты: ${availableExports.length > 0 ? availableExports.join(", ") : "(нет функций)"}`,
      )
    }
  } else {
    // По умолчанию используем default экспорт
    actionFn = mod.default
    if (typeof actionFn !== "function") {
      const availableExports = Object.keys(mod).filter((key) => typeof mod[key] === "function")
      throw new Error(
        `Модуль "${moduleSrc}" не экспортирует валидную функцию действия (default). ` +
          `Доступные экспорты: ${availableExports.length > 0 ? availableExports.join(", ") : "(нет функций)"}`,
      )
    }
  }

  return actionFn
}

// Ре-экспорт для удобства
export { executeProcess } from "./execute"
export type { ProcessConfig } from "./load.t"
export type { ExecuteParams } from "./execute.t"
