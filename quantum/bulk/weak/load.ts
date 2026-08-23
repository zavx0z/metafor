/**
 * Runtime-модуль для загрузки модулей действий процессов.
 *
 * Предоставляет функцию для динамической загрузки ESM-модулей и извлечения функций действий.
 * Загружает модули через import() и валидирует экспортированные функции.
 *
 * @packageDocumentation
 */
import type {Fields} from "@metafor/types/metafor/fields"
import type {Energy, Mass} from "@metafor/types/metafor/schema"
import type { ActionFn, ProcessConfig } from "@bulk/types/weak"

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
export async function loadAction<ɸ extends Fields, m extends Mass, e extends Energy = Energy>(
  config: ProcessConfig | string,
): Promise<ActionFn<ɸ, m, any, e>> {
  // Нормализация конфигурации
  const moduleSrc = typeof config === "string" ? config : config.src
  const importSpecifier = typeof config === "string" ? undefined : config.importSpecifier

  // Динамический импорт модуля действия
  const mod = await import(moduleSrc)

  // Получение экспортированной функции
  let actionFn: ActionFn<ɸ, m, any, e> | undefined

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

export { executeProcess } from "./execute"
