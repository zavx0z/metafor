/**
 * Runtime-модуль для исполнения действий процессов.
 *
 * Предоставляет движок для динамической загрузки и исполнения ESM-модулей действий.
 * Загружает модули через import() и вызывает экспортированные функции с параметрами.
 *
 * @packageDocumentation
 */

import type { Schema } from "@zavx0z/context"
import type { Mass, ActionParams } from "@metafor/meta"

/**
 * Конфигурация процесса для исполнения.
 * Содержит информацию о модуле и спецификаторе импорта.
 */
export interface ProcessConfig {
  /** Путь к ESM-модулю с действием */
  src: string
  /** Имя экспорта для импорта (например, "default", "commit", "process") */
  importSpecifier?: string
}

/**
 * Исполняет действие процесса через динамический импорт и вызов модуля.
 *
 * Загружает модуль действия через import(), извлекает экспортированную функцию
 * по указанному спецификатору и исполняет её с переданными параметрами.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 * @template Res - Тип возвращаемого значения функции действия
 *
 * @param config - Конфигурация процесса (src и importSpecifier)
 * @param params - Параметры для передачи в функцию действия
 * @returns Promise с результатом исполнения действия
 * @throws Error если модуль не экспортирует валидную функцию
 *
 * @example
 * ```typescript
 * // Исполнение с явным спецификатором
 * const result = await executeProcess<MySchema, MyMass, ResultType>(
 *   { src: "./actions/loader.ts", importSpecifier: "default" },
 *   { value, mass, schema, self }
 * )
 *
 * // Исполнение с default экспортом (importSpecifier не указан)
 * const result = await executeProcess(
 *   { src: "./actions/loader.ts" },
 *   { value, mass, schema, self }
 * )
 * ```
 */
export async function executeProcess<ɸ extends Schema, m extends Mass, Res>(
  config: ProcessConfig | string,
  params?: ActionParams<ɸ, m>
): Promise<Res> {
  // Нормализация конфигурации
  const moduleSrc = typeof config === "string" ? config : config.src
  const importSpecifier = typeof config === "string" ? undefined : config.importSpecifier

  // Динамический импорт модуля действия
  const mod = await import(moduleSrc)

  // Получение экспортированной функции
  let actionFn: Function | undefined

  if (importSpecifier) {
    // Используем точный спецификатор из схемы
    actionFn = mod[importSpecifier]
    if (typeof actionFn !== "function") {
      const availableExports = Object.keys(mod).filter(key => typeof mod[key] === "function")
      throw new Error(
        `Модуль "${moduleSrc}" не экспортирует функцию "${importSpecifier}". ` +
          `Доступные экспорты: ${availableExports.length > 0 ? availableExports.join(", ") : "(нет функций)"}`
      )
    }
  } else {
    // Fallback: пытаемся угадать (для обратной совместимости)
    actionFn = mod.default || mod.action || mod.process || mod.load || mod.run || mod.execute
  }

  if (typeof actionFn !== "function") {
    throw new Error(
      `Модуль "${moduleSrc}" не экспортирует валидную функцию действия. ` +
        `Ожидается default-экспорт или именованный экспорт функции.`
    )
  }

  // Исполнение функции с параметрами
  return await actionFn(params)
}

/**
 * Исполняет действие процесса с уже загруженным модулем.
 *
 * Используется для тестирования или когда модуль уже загружен.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 * @template Res - Тип возвращаемого значения функции действия
 *
 * @param mod - Загруженный модуль
 * @param importSpecifier - Имя экспорта для вызова
 * @param params - Параметры для передачи в функцию действия
 * @returns Promise с результатом исполнения действия
 *
 * @example
 * ```typescript
 * const mod = await import("./actions/loader.ts")
 * const result = await executeProcessWithModule(mod, "default", params)
 * ```
 */
export async function executeProcessWithModule<ɸ extends Schema, m extends Mass, Res>(
  mod: Record<string, any>,
  importSpecifier: string,
  params?: ActionParams<ɸ, m>
): Promise<Res> {
  const actionFn = mod[importSpecifier]

  if (typeof actionFn !== "function") {
    const availableExports = Object.keys(mod).filter(key => typeof mod[key] === "function")
    throw new Error(
      `Модуль не экспортирует функцию "${importSpecifier}". ` +
        `Доступные экспорты: ${availableExports.length > 0 ? availableExports.join(", ") : "(нет функций)"}`
    )
  }

  return await actionFn(params)
}
