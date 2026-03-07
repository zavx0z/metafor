/**
 * Типы для Force.
 *
 * @packageDocumentation
 */
import type { FieldsDefinition } from "./strong/field.t"
import type { Collapse } from "@boundary/fields"
import type { MetaJson } from "@metafor/ast"

// ============================================================================
// ОБЩИЕ ТИПЫ
// ============================================================================

/**
 * Суперпозиция — граф переходов между состояниями.
 *
 * @remarks
 * Force оперирует именами состояний и полей (семантика).
 * При `updateBoundary()` конвертируется в `NumericSuperposition` для Boundary.
 *
 * @example
 * ```typescript
 * {
 *   IDLE: {
 *     PATROL: { hp: { gt: 50 } },  // Имя поля: hp, имя состояния: PATROL
 *     DEAD: { hp: { lte: 0 } }
 *   },
 *   PATROL: null,
 *   DEAD: null
 * }
 * ```
 */
export interface Superposition {
  [state: string]: Record<string, any> | null
}

/**
 * Намерение — ключ процесса для выполнения при переходе в состояние.
 *
 * @remarks
 * Намерение указывает, какой процесс должен быть выполнен при переходе в данное состояние.
 * Берётся из DSL-декларации процессов. Не у каждого состояния есть намерение.
 */
export type Intention = string

/**
 * Карта намерений по именам состояний.
 *
 * @remarks
 * Не у каждого состояния есть намерение. Если намерения нет — состояние терминальное или не требует действия.
 */
export type Intentions = Record<string, Intention | null>

/**
 * Конфигурация актора.
 *
 * @remarks
 * **Порядок переходов в суперпозиции важен!**
 * Переходы проверяются в порядке объявления ключей.
 * Первый выполненный переход останавливает проверку.
 *
 * @example
 * ```typescript
 * const uuid = crypto.randomUUID()
 * createActor({
 *   uuid,
 *   fields: {
 *     hp: { type: "number" },
 *     mana: { type: "number" },
 *     isAlive: { type: "boolean" }
 *   },
 *   values: { hp: 100, mana: 50, isAlive: true },
 *   superposition: {
 *     IDLE: {
 *       PATROL: { hp: { gt: 50 } },   // ← Приоритет 1: hp > 50
 *       DEAD: { hp: { lte: 0 } }      // ← Приоритет 2: hp <= 0
 *     },
 *     PATROL: {
 *       IDLE: { mana: { lt: 10 } },   // mana < 10 → IDLE
 *       COMBAT: { isAlive: true }     // isAlive === true → COMBAT
 *     },
 *     DEAD: null                       // Терминальное состояние
 *   },
 *   intentions: {
 *     PATROL: "patrolProcess",        // Ключ процесса из DSL
 *     DEAD: "deathProcess"
 *   }
 * })
 * ```
 */
export interface ActorConfig {
  /** UUID актора (генерируется вызывающей стороной) */
  uuid: string
  fields: FieldsDefinition
  values: Record<string, unknown>
  superposition: Superposition
  intentions?: Intentions
}

/**
 * Функция обновления параметров (не используется в execute).
 */
export type Update = (params: Record<string, unknown>) => void

// ============================================================================
// ТИПЫ ХРАНИЛИЩ
// ============================================================================

/**
 * Индекс браны в Boundary (позиция в массиве).
 */
export type BraneIndex = number

/**
 * Числовая суперпозиция для Boundary (индексы).
 */
export interface NumericSuperposition {
  transitions: Array<Array<Collapse>>
}

/**
 * Уникальный идентификатор актора (UUID v4).
 *
 * @example
 * ```ts
 * const id: ActorId = crypto.randomUUID()
 * ```
 */
export type ActorId = string

/**
 * Хранилище конфигурации полей для каждого актора.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** {@link FieldsDefinition} — схема типов полей
 */
export type FieldsStore = Map<ActorId, FieldsDefinition>

/**
 * Хранилище карты намерений для каждого актора.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** {@link Intentions} — ключи процессов для выполнения при смене состояния
 */
export type IntentionsStore = Map<ActorId, Intentions>

/**
 * Хранилище схем процессов из DSL.
 *
 * - **Ключ:** {@link Intention} — ключ процесса (ID намерения)
 * - **Значение:** {@link MetaJson} — схема процесса (src, read, write, label, desc)
 *
 * @remarks
 * Схемы процессов загружаются из DSL-декларации и используются координатором
 * для выполнения процессов при изменении состояний акторов.
 */
export type ProcessesStore = Map<Intention, MetaJson>

/**
 * Хранилище runtime-параметров каждого актора.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** `Record<string, unknown>` — изменяемые данные браны
 */
export type ParamsStore = Map<ActorId, Record<string, unknown>>

/**
 * Хранилище суперпозиции (правила перехода) для каждого актора.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** {@link Superposition} — статичная конфигурация переходов (формат Force)
 *
 * @remarks
 * Хранится в формате Force (с именами). При `updateBoundary()` конвертируется в {@link NumericSuperposition}.
 */
export type SuperpositionsStore = Map<ActorId, Superposition>

/**
 * Хранилище текущего состояния каждого актора.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** имя текущего состояния (`string`)
 */
export type StatesStore = Map<ActorId, string>

/**
 * Маппинг UUID актора в индекс в Boundary.
 *
 * - **Ключ:** {@link ActorId}
 * - **Значение:** {@link BraneIndex} — позиция в массиве бран Boundary
 */
export type UuidToIndexStore = Map<ActorId, BraneIndex>

/**
 * Обратный маппинг: индекс в Boundary → UUID актора.
 *
 * - **Ключ:** {@link BraneIndex} — позиция в массиве бран Boundary
 * - **Значение:** {@link ActorId}
 */
export type IndexToUuidStore = Map<BraneIndex, ActorId>

// ============================================================================
// ТИПЫ ДЛЯ FORCE.TS
// ============================================================================

/**
 * Изменение состояния браны.
 */
export interface BraneStateChange {
  /** UUID актора */
  actorId: ActorId
  /** Предыдущее состояние (undefined при первой инициализации) */
  oldState: string | undefined
  /** Текущее состояние */
  newState: string
  /** Намерение (ключ процесса) если есть */
  intention?: Intention | null
  /** Текущие значения актора */
  values: Record<string, unknown>
}

/**
 * Обновление одного или нескольких акторов.
 */
export interface ActorUpdate {
  /** UUID актора */
  uuid: string
  /** Новые значения полей (пустой объект для разблокировки без изменений) */
  fields?: Record<string, unknown>
  /** Если true, блокирует переходы; если false — разблокирует; undefined — не менять */
  lock?: boolean
}
