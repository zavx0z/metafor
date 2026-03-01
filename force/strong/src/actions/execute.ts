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
 * Исполняет действие процесса через динамический импорт и вызов модуля.
 *
 * Загружает модуль действия через import(), извлекает экспортированную функцию
 * и исполняет её с переданными параметрами. Поддерживает любой именованный экспорт
 * или default-экспорт.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 * @template Res - Тип возвращаемого значения функции действия
 *
 * @param moduleSrc - Путь к ESM-модулю с действием
 * @param params - Параметры для передачи в функцию действия
 * @returns Promise с результатом исполнения действия
 * @throws Error если модуль не экспортирует валидную функцию
 *
 * @example
 * ```typescript
 * // Исполнение действия процесса
 * const result = await executeProcess<MySchema, MyMass, ResultType>(
 *   "./actions/loader.ts",
 *   { value, mass, schema, self, update }
 * )
 * ```
 */
export async function executeProcess<ɸ extends Schema, m extends Mass, Res>(
  moduleSrc: string,
  params: ActionParams<ɸ, m>
): Promise<Res> {
  // Динамический импорт модуля действия
  const mod = await import(moduleSrc)

  // Получение экспортированной функции (default или первая доступная функция)
  const actionFn = mod.default || mod.action || mod.process || mod.load || mod.run || mod.execute

  if (typeof actionFn !== "function") {
    throw new Error(
      `Модуль "${moduleSrc}" не экспортирует валидную функцию действия. ` +
        `Ожидается default-экспорт или именованный экспорт функции.`
    )
  }

  // Исполнение функции с параметрами
  return await actionFn(params)
}
