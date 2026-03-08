/**
 * Force Store — хранилище состояния акторов.
 *
 * @packageDocumentation
 */

import type { ForceStoreState } from "./store.t"

/**
 * @module force$ — локальное хранилище FORCE-домена.
 *
 * @property globalFields {@link ForceStoreState.globalFields|глобальные поля}
 * @property fieldNameIndex {@link ForceStoreState.fieldNameIndex|маппинг имён полей}
 * @property intentions {@link ForceStoreState.intentions|намерения акторов}
 * @property superpositions {@link ForceStoreState.superpositions|суперпозиции}
 * @property states {@link ForceStoreState.states|текущие состояния}
 * @property actorParams {@link ForceStoreState.actorParams|параметры акторов}
 * @property uuidToIndex {@link ForceStoreState.uuidToIndex|маппинг UUID → индекс}
 * @property indexToUuid {@link ForceStoreState.indexToUuid|маппинг индекс → UUID}
 * @property stateMaps {@link ForceStoreState.stateMaps|маппинг состояний}
 * @property onStateChange {@link ForceStoreState.onStateChange|callback изменений}
 * @property actorIds {@link ForceStoreState.actorIds|множество UUID акторов}
 * @property nextFieldIndex {@link ForceStoreState.nextFieldIndex|счётчик полей}
 * @property fieldsDefinition {@link ForceStoreState.fieldsDefinition|определение полей}
 * @see {@link ForceStoreState} — тип состояния
 */
export const force$: ForceStoreState = {
  globalFields: new Map(),
  fieldNameIndex: new Map(),
  intentions: new Map(),
  superpositions: new Map(),
  states: new Map(),
  actorParams: new Map(),
  uuidToIndex: new Map(),
  indexToUuid: new Map(),
  stateMaps: new Map(),
  onStateChange: { current: null },
  actorIds: new Set(),
  nextFieldIndex: 0,
  fieldsDefinition: {},
}

/**
 * Сбрасывает состояние FORCE-домена.
 *
 * @param store$ - Стор для сброса.
 */
export function resetForceStore(store$: ForceStoreState): void {
  store$.globalFields.clear()
  store$.fieldNameIndex.clear()
  store$.intentions.clear()
  store$.superpositions.clear()
  store$.states.clear()
  store$.actorParams.clear()
  store$.uuidToIndex.clear()
  store$.indexToUuid.clear()
  store$.stateMaps.clear()
  store$.onStateChange.current = null
  store$.actorIds.clear()
  store$.nextFieldIndex = 0
  store$.fieldsDefinition = {}
}

/**
 * Восстанавливает состояние FORCE-домена.
 *
 * @param store$ - Стор для восстановления.
 * @param state - Состояние для восстановления.
 */
export function restoreForceStore(store$: ForceStoreState, state: ForceStoreState): void {
  store$.globalFields = state.globalFields
  store$.fieldNameIndex = state.fieldNameIndex
  store$.intentions = state.intentions
  store$.superpositions = state.superpositions
  store$.states = state.states
  store$.actorParams = state.actorParams
  store$.uuidToIndex = state.uuidToIndex
  store$.indexToUuid = state.indexToUuid
  store$.stateMaps = state.stateMaps
  store$.onStateChange = state.onStateChange
  store$.actorIds = state.actorIds
  store$.nextFieldIndex = state.nextFieldIndex
  store$.fieldsDefinition = state.fieldsDefinition
}
