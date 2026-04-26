/**
 * Запись `actor_value` — связь актор-поле-меты с записью значения.
 *
 * PK (actor, metaField). Если две строки `actor_value` ссылаются на один
 * `value.uuid` — соответствующие акторы запутаны по этому полю.
 */

/** Связь актор-поле-меты → значение. PK (actor, metaField). */
export interface ActorValueRecord {
  actor: string
  /** UUID поля в meta-декларации (FK на `field.uuid`). */
  metaField: string
  /** UUID записи значения (FK на `value.uuid`). */
  value: string
}
