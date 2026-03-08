/**
 * Force Store — типы хранилища акторов.
 *
 * @packageDocumentation
 */

import type {
  IntentionsStore,
  IndexToUuidStore,
  ActorId,
  StatesStore,
  SuperpositionsStore,
  UuidToIndexStore,
  BraneStateChange,
} from "./force.t"
import type { FieldDefinition, FieldsDefinition } from "./strong/field.t"
import type { Field } from "@boundary/fields"

/**
 * Внутреннее состояние FORCE-домена.
 */
export interface ForceStoreState {
  /** Глобальные поля: имя → [индекс, поле] */
  globalFields: Map<string, [number, Field]>
  /** Маппинг имён полей в индексы */
  fieldNameIndex: Map<string, number>
  /** Намерения акторов: ActorId → { состояние → намерение } */
  intentions: IntentionsStore
  /** Суперпозиции состояний акторов */
  superpositions: SuperpositionsStore
  /** Текущие состояния акторов */
  states: StatesStore
  /** Параметры акторов: ActorId → { поле → значение } */
  actorParams: Map<ActorId, Record<string, unknown>>
  /** Маппинг UUID → индекс браны */
  uuidToIndex: UuidToIndexStore
  /** Маппинг индекс браны → UUID */
  indexToUuid: IndexToUuidStore
  /** Маппинг состояний для reverse-маппинга: ActorId → [состояния] */
  stateMaps: Map<ActorId, string[]>
  /** Callback на изменение состояния */
  onStateChange: { current: ((changes: BraneStateChange[]) => void) | null }
  /** Множество UUID всех акторов */
  actorIds: Set<ActorId>
  /** Счётчик индексов полей */
  nextFieldIndex: number
  /** Определение полей для write() */
  fieldsDefinition: FieldsDefinition

  /** Сбрасывает состояние хранилища */
  reset(): void
  /** Восстанавливает состояние хранилища */
  restore(state: ForceStoreState): void
}
