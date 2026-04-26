/**
 * `@store/actor` — реляционное хранилище инстансного слоя.
 *
 * 5 сущностей: actor + value + value_item + actor_value + actor_state.
 * Entanglement выражен через разделение записи `value` (один `value.uuid` —
 * несколько строк `actor_value`).
 *
 * Корневой entry-point держит **общие типы и ORM-классы** — без привязки к
 * конкретному backend (классы получают `SQL` через конструктор).
 * Backend-специфичные имплементации лежат в subpath:
 * - `@store/actor/sqlite` — bun-sqlite реализация
 * - `@store/actor/idb` — IndexedDB реализация (планируется)
 *
 * См. `store/actor/README.md` и `store/README.md` для архитектурных принципов.
 */

export type { ActorRecord, ActorRows } from "./sqlite/actor.t.ts"
export type { ActorStateRecord } from "./sqlite/state.t.ts"
export type { ActorValueRecord } from "./sqlite/actor_value.t.ts"
export type { Scalar, ScalarKind, ValueItemRecord, ValueKind, ValueRecord } from "./sqlite/value.t.ts"

export {
  Actor,
  ActorChildren,
  ActorFieldValue,
  ActorRoots,
  ActorValues,
  BooleanValue,
  EnumValue,
  ListValue,
  NullValue,
  NumberValue,
  StringValue,
  Value,
} from "./sqlite/index.ts"
