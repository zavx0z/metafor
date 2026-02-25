/**
 * Типы хранилищ для Monad.
 *
 * @packageDocumentation
 */

import type { FieldsDefinition, Superposition, BraneIndex } from "@metafor/boundary"
import type { Actions } from "./types"

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
 * Хранилище карты действий для каждой монады.
 *
 * - **Ключ:** {@link MonadId}
 * - **Значение:** {@link Actions} — функции, выполняемые при смене состояния
 */
export type ActionsStore = Map<MonadId, Actions>

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
 * - **Значение:** {@link Superposition} — статичная конфигурация переходов
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
