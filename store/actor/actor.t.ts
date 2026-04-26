/**
 * Канонические record-типы сущности `actor`.
 *
 * Один актор — это запущенный экземпляр меты со своим состоянием.
 * Поля не дублируются в этом слое — они объявлены в `meta`. Актор только
 * связывает свои значения с полями меты через `actor_value`.
 *
 * Все ID — TEXT-идентификаторы. Стабильные UUID-ы.
 */

import type { ActorStateRecord } from "./state.t.ts"
import type { ActorValueRecord } from "./actor_value.t.ts"
import type { ValueItemRecord, ValueRecord } from "./value.t.ts"

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
