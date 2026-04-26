import type {
  ActorEdgeRecord,
  ActorEntanglementFamilyRows,
  ActorFieldRecord,
  ActorRecord,
  ActorRows,
  ActorScalar,
  ActorSourceRecord,
  ActorStateRecord,
  ActorValueRecord,
} from "./types.t.ts"

/**
 * Имена таблиц actor-слоя в любом backend (sqlite, idb).
 * Префикс `actor_` обязателен — это namespace инстансного слоя в общей БД.
 */
export type ActorBackendTableName =
  | "actor"
  | "actor_edge"
  | "actor_field"
  | "actor_value"
  | "actor_value_item"
  | "actor_source"
  | "actor_state"
  | "actor_entanglement"
  | "actor_entanglement_member"
  | "actor_entanglement_field"
  | "actor_entanglement_field_member"

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
 * одинаковое наблюдаемое поведение этих методов. Backend-специфичные
 * оптимизации (индексы, WAL, колоночные форматы) — деталь реализации.
 */
export interface ActorBackend {
  readonly requiredIndexes: readonly ActorBackendIndexSpec[]

  close(): ActorBackendAwaitable<void>
  reset(): ActorBackendAwaitable<void>
  flush(): Promise<void>

  // Адресные чтения
  listActorIds(world: string): Promise<string[]>
  readActorRows(uuid: string): Promise<ActorRows | null>
  readActorField(fieldUuid: string): Promise<ActorFieldRecord | null>
  readActorEdge(child: string): Promise<ActorEdgeRecord | null>
  readActorValue(fieldUuid: string): Promise<ActorValueRecord | null>
  readActorSource(childField: string): Promise<ActorSourceRecord | null>
  readActorState(actor: string): Promise<ActorStateRecord | null>
  readEntanglementFamily(uuid: string): Promise<ActorEntanglementFamilyRows | null>

  // Записи актора
  /** Записывает row-group актора одной транзакцией: actor + edge + fields + values + sources + state. */
  writeActorRows(rows: ActorRows): ActorBackendAwaitable<void>
  /** Удаляет актора и каскадно всё его state. */
  deleteActor(uuid: string): ActorBackendAwaitable<void>

  // Точечные операции
  /** Меняет одно скалярное значение (без обхода всего актора). */
  setActorValue(fieldUuid: string, value: ActorScalar | { kind: "list" }): ActorBackendAwaitable<void>
  /** Записывает элемент списочного значения по позиции. */
  writeActorValueItem(fieldUuid: string, position: number, item: ActorScalar): ActorBackendAwaitable<void>
  /** Удаляет хвост списочного значения начиная с указанной позиции (для shrink-операций). */
  truncateActorValueItems(fieldUuid: string, fromPosition: number): ActorBackendAwaitable<void>
  /** Меняет состояние FSM актора. */
  setActorState(actor: string, metaState: string): ActorBackendAwaitable<void>

  // Записи entanglement-семьи
  writeEntanglementFamily(rows: ActorEntanglementFamilyRows): ActorBackendAwaitable<void>
  deleteEntanglementFamily(uuid: string): ActorBackendAwaitable<void>

  // Перечисление мира (для рантайма, который хочет обойти всех акторов)
  listWorldActors(world: string): Promise<ActorRecord[]>
}

/**
 * Стандартный набор индексов actor-стора. Применяется ко всем backend-имплементациям.
 */
export const actorRequiredBackendIndexes: readonly ActorBackendIndexSpec[] = [
  { name: "actor_by_world", table: "actor", columns: ["world"], unique: false },
  { name: "actor_by_world_and_position", table: "actor", columns: ["world", "position"], unique: true },
  { name: "actor_by_meta_src", table: "actor", columns: ["metaSrc"], unique: false },

  { name: "actor_edge_by_parent", table: "actor_edge", columns: ["parent"], unique: false },
  { name: "actor_edge_by_parent_and_position", table: "actor_edge", columns: ["parent", "position"], unique: false },

  { name: "actor_field_by_actor", table: "actor_field", columns: ["actor"], unique: false },
  { name: "actor_field_by_actor_and_position", table: "actor_field", columns: ["actor", "position"], unique: true },
  { name: "actor_field_by_actor_and_meta_field", table: "actor_field", columns: ["actor", "metaField"], unique: true },

  { name: "actor_source_by_parent_field", table: "actor_source", columns: ["parentField"], unique: false },

  { name: "actor_entanglement_by_world", table: "actor_entanglement", columns: ["world"], unique: false },
  { name: "actor_entanglement_by_root_field", table: "actor_entanglement", columns: ["rootField"], unique: true },

  {
    name: "actor_entanglement_member_by_entanglement",
    table: "actor_entanglement_member",
    columns: ["entanglement"],
    unique: false,
  },
  {
    name: "actor_entanglement_member_by_actor",
    table: "actor_entanglement_member",
    columns: ["actor"],
    unique: false,
  },

  {
    name: "actor_entanglement_field_by_entanglement",
    table: "actor_entanglement_field",
    columns: ["entanglement"],
    unique: false,
  },
  {
    name: "actor_entanglement_field_by_entanglement_and_position",
    table: "actor_entanglement_field",
    columns: ["entanglement", "position"],
    unique: true,
  },

  {
    name: "actor_entanglement_field_member_by_field",
    table: "actor_entanglement_field_member",
    columns: ["entanglementField"],
    unique: false,
  },
  {
    name: "actor_entanglement_field_member_by_actor_field",
    table: "actor_entanglement_field_member",
    columns: ["actorField"],
    unique: true,
  },
] as const
