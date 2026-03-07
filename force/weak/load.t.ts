/**
 * Типы для runtime-модуля загрузки действий процессов.
 *
 * @packageDocumentation
 */

import type { Schema, Values, Mass, Self } from "@metafor/meta"

/**
 * Конфигурация процесса для загрузки.
 * Содержит информацию о модуле и спецификаторе импорта.
 */
export interface ProcessConfig {
  /** Путь к ESM-модулю с действием */
  src: string
  /** Имя экспорта для импорта (например, "default", "commit", "process") */
  importSpecifier?: string
}

/**
 * Функция действия процесса.
 *
 * @template ɸ - Тип схемы полей атома
 * @template m - Тип массы атома
 * @template Res - Тип возвращаемого значения
 */
export type ActionFn<ɸ extends Schema, m extends Mass, Res> = (params: {
  self: Self
  field: ɸ
  value: Values<ɸ>
  mass: m
}) => Res | Promise<Res>
