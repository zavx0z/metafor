import type { ActorRecord, ActorRows } from "./sqlite/actor.t.ts"
import type { ActorStateRecord } from "./sqlite/state.t.ts"
import type { ActorValueRecord } from "./sqlite/actor_value.t.ts"
import type { Scalar, ValueItemRecord, ValueRecord } from "./sqlite/value.t.ts"

/**
 * Имена таблиц actor-слоя. Префикс `actor_` обязателен для actor-сущностей,
 * `value*` — глобальные value-записи (могут разделяться).
 */
export type ActorBackendTableName = "actor" | "actor_value" | "actor_state" | "value" | "value_item"

export interface ActorBackendIndexSpec {
  name: string
  table: ActorBackendTableName
  columns: readonly string[]
  unique: boolean
}

export type ActorBackendAwaitable<T> = T | Promise<T>

/**
 * Контракт actor-стора. Адресный API без полных дампов.
 *
 * Любая реализация (sqlite, idb, in-memory, мок) должна обеспечивать
 * одинаковое наблюдаемое поведение. Backend-специфичные оптимизации (индексы,
 * WAL, колоночные форматы) — деталь реализации, не контракта.
 */
export interface ActorBackend {
  readonly requiredIndexes: readonly ActorBackendIndexSpec[]

  close(): ActorBackendAwaitable<void>
  reset(): ActorBackendAwaitable<void>
  flush(): Promise<void>

  // Адресные чтения акторов
  /** Все корневые акторы (parent IS NULL), упорядочены по `position`. */
  listRootActors(): Promise<ActorRecord[]>
  /** Все дочерние акторы данного родителя, упорядочены по `position`. */
  listChildActors(parent: string): Promise<ActorRecord[]>
  readActor(uuid: string): Promise<ActorRecord | null>
  readActorRows(uuid: string): Promise<ActorRows | null>
  readActorState(actor: string): Promise<ActorStateRecord | null>
  readActorValue(actor: string, metaField: string): Promise<ActorValueRecord | null>

  // Адресные чтения значений
  readValue(uuid: string): Promise<ValueRecord | null>
  readValueItems(value: string): Promise<ValueItemRecord[]>
  /** Кто разделяет это значение. Длина результата > 1 = entanglement. */
  listValueOwners(value: string): Promise<ActorValueRecord[]>

  // Записи
  /** Записывает row-group актора одной транзакцией: actor + values + value-records + value-items + state. */
  writeActorRows(rows: ActorRows): ActorBackendAwaitable<void>
  /** Удаляет актора, его связи и orphan-записи value (на которые больше никто не ссылается). */
  deleteActor(uuid: string): ActorBackendAwaitable<void>
  /** Меняет содержимое записи value (касается всех акторов, разделяющих её). */
  setValue(uuid: string, scalar: Scalar | { kind: "list" }): ActorBackendAwaitable<void>
  /** Записывает/обновляет элемент списочного значения по позиции. */
  writeValueItem(value: string, position: number, item: Scalar): ActorBackendAwaitable<void>
  /** Удаляет хвост списочного значения (для shrink). */
  truncateValueItems(value: string, fromPosition: number): ActorBackendAwaitable<void>
  /** Меняет состояние FSM актора. */
  setActorState(actor: string, metaState: string): ActorBackendAwaitable<void>

  /**
   * Связывает актор-поле с существующей записью value (entanglement).
   * Если у actor-поля уже была запись и она orphan-нулась — удаляется.
   */
  shareValue(actor: string, metaField: string, value: string): ActorBackendAwaitable<void>
  /**
   * Расщепляет shared value: создаёт новую копию записи value под одного актор-поле,
   * остальные продолжают делить старую. Возвращает новый uuid value.
   */
  forkValue(actor: string, metaField: string): Promise<string>
}

export const actorRequiredBackendIndexes: readonly ActorBackendIndexSpec[] = [
  // actor
  { name: "actor_by_meta", table: "actor", columns: ["meta"], unique: false },
  { name: "actor_by_parent", table: "actor", columns: ["parent"], unique: false },
  { name: "actor_by_parent_and_position", table: "actor", columns: ["parent", "position"], unique: false },

  // actor_value
  { name: "actor_value_by_value", table: "actor_value", columns: ["value"], unique: false },
  { name: "actor_value_by_meta_field", table: "actor_value", columns: ["metaField"], unique: false },

  // value (variant)
  { name: "value_by_variant", table: "value", columns: ["variant"], unique: false },
] as const
