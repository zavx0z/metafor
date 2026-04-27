/**
 * Запись `actor_value` — связь актор-поле-меты с записью значения.
 *
 * PK (actor, field). Если две строки `actor_value` ссылаются на один
 * `value.uuid` — соответствующие акторы запутаны по этому полю.
 */

/** Связь актор-поле-меты → значение. PK (actor, field). */
export interface ActorValueRecord {
  actor: string
  /** UUID поля в meta-декларации (FK на `field.uuid`). */
  field: string
  /** UUID записи значения (FK на `value.uuid`). */
  value: string
}
