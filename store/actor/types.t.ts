/**
 * Канонические record-типы инстансного слоя (actor).
 *
 * Один актор — это запущенный экземпляр меты со своим состоянием.
 * Поля не дублируются в этом слое — они объявлены в `meta`. Актор только
 * связывает свои значения с полями меты через `actor_value`.
 *
 * Entanglement выражен через **разделение записи `value`**: если две строки
 * `actor_value` указывают на один `value.uuid`, акторы запутаны. Никаких
 * отдельных таблиц `actor_entanglement_*` не существует.
 *
 * Все ID — TEXT-идентификаторы. Стабильные UUID-ы.
 */

export type ScalarKind = "null" | "boolean" | "number" | "string" | "enum"
export type ValueKind = ScalarKind | "list"

/** Один запущенный актор. */
export interface ActorRecord {
  uuid: string
  /** UUID родителя (NULL у корневого; self-FK на `actor.uuid`). */
  parent: string | null
  /** Канонический `src` меты — FK на `meta.src`. */
  meta: string
  /** Порядок появления среди братьев в одном parent-уровне. */
  position: number
}

/** Запись значения. Может разделяться несколькими акторами (entanglement). */
export interface ValueRecord {
  uuid: string
  kind: ValueKind
  boolean?: boolean
  number?: number
  text?: string
  /** UUID `field_enum_variant` из meta (для kind="enum"). */
  variant?: string
}

/** Элемент списочного значения (когда `value.kind === "list"`). */
export interface ValueItemRecord {
  value: string
  position: number
  kind: ScalarKind
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

/** Связь актор-поле-меты → значение. PK (actor, metaField). */
export interface ActorValueRecord {
  actor: string
  /** UUID поля в meta-декларации (FK на `field.uuid`). */
  metaField: string
  /** UUID записи значения (FK на `value.uuid`). */
  value: string
}

/** Текущее состояние FSM актора. */
export interface ActorStateRecord {
  actor: string
  /** UUID `superposition` из meta. */
  metaState: string
}

/** Скалярная или enum-часть значения, заполняется одна из колонок в зависимости от kind. */
export interface Scalar {
  kind: ScalarKind
  boolean?: boolean
  number?: number
  text?: string
  variant?: string
}

/** Полный row-group одного актора — read/write единицей. */
export interface ActorRows {
  actor: ActorRecord
  /** Все поля актора, которые имеют значения. Каждое — связь с записью value. */
  values: ActorValueRecord[]
  /** Записи value, на которые ссылаются данные актора. Могут разделяться с другими акторами. */
  valueRecords: ValueRecord[]
  /** Элементы списочных значений (для тех value, где kind="list"). */
  valueItems: ValueItemRecord[]
  state: ActorStateRecord
}
