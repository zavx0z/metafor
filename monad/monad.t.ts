/**
 * Типы хранилищ для Monad.
 *
 * @packageDocumentation
 */
import type { Intentions, Superposition, Intention } from "./types"
import type { ParsedProcessJson } from "../metafor/build/monadJson"
import type { Collapse } from "@boundary/fields"
import type { FieldsDefinition } from "./field"

/**
 * Индекс браны в Boundary (позиция в массиве).
 */
export type BraneIndex = number

/**
 * Числовая суперпозиция для BOUNDARY (индексы).
 */
export interface NumericSuperposition {
  transitions: Array<Array<Collapse>>
}

/**
 * Уникальный идентификатор монады (UUID v4).
 *
 * @example
 * ```ts
 * const id: MonadId = crypto.randomUUID()
 * ```
 */
export type MonadId = string

/**
 * Хранилище конфигурации полей для каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** {@link FieldsDefinition} — схема типов полей
 */
export type FieldsStore = Map<MonadId, FieldsDefinition>

/**
 * Хранилище карты намерений для каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** {@link Intentions} — ключи процессов для выполнения при смене состояния
 */
export type IntentionsStore = Map<MonadId, Intentions>

/**
 * Хранилище схем процессов из DSL.
 *
 * - **Ключ:** {@link Intention} — ключ процесса (ID намерения)
 * - **Значение:** {@link ParsedProcessJson} — схема процесса (src, read, write, label, desc)
 *
 * @remarks
 * Схемы процессов загружаются из DSL-декларации и используются координатором
 * для выполнения процессов при изменении состояний монад.
 */
export type ProcessesStore = Map<Intention, ParsedProcessJson>

/**
 * Хранилище runtime-параметров каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** `Record<string, unknown>` — изменяемые данные браны
 */
export type ParamsStore = Map<MonadId, Record<string, unknown>>

/**
 * Хранилище суперпозиции (правила перехода) для каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** {@link Superposition} — статичная конфигурация переходов (формат MONAD)
 *
 * @remarks
 * Хранится в формате MONAD (с именами). При `updateBoundary()` конвертируется в {@link NumericSuperposition}.
 */
export type SuperpositionsStore = Map<MonadId, Superposition>

/**
 * Хранилище текущего состояния каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** имя текущего состояния (`string`)
 */
export type StatesStore = Map<MonadId, string>

/**
 * Маппинг UUID монады в индекс в Boundary.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** {@link BraneIndex} — позиция в массиве бран Boundary
 */
export type UuidToIndexStore = Map<MonadId, BraneIndex>

/**
 * Обратный маппинг: индекс в Boundary → UUID монады.
 *
 * - **Ключ:** {@link BraneIndex} — позиция в массиве бран Boundary
 * - **Значение:** {@link MonadId}
 */
export type IndexToUuidStore = Map<BraneIndex, MonadId>
