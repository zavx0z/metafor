/**
 * Запись `actor_state` — текущее состояние FSM актора.
 *
 * PK (actor). Связь с конкретной `superposition` из meta-декларации.
 */

/** Текущее состояние FSM актора. */
export interface ActorStateRecord {
  actor: string
  /** UUID `superposition` из meta. */
  metaState: string
}
