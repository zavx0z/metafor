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
 * @property processes {@link ForceStoreState.processes|схемы процессов}
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
export const force$: ForceStoreState & {
  reset(): void
  restore(state: ForceStoreState): void
} = {
  globalFields: new Map(),
  fieldNameIndex: new Map(),
  intentions: new Map(),
  processes: new Map(),
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

  reset() {
    this.globalFields.clear()
    this.fieldNameIndex.clear()
    this.intentions.clear()
    this.processes.clear()
    this.superpositions.clear()
    this.states.clear()
    this.actorParams.clear()
    this.uuidToIndex.clear()
    this.indexToUuid.clear()
    this.stateMaps.clear()
    this.onStateChange.current = null
    this.actorIds.clear()
    this.nextFieldIndex = 0
    this.fieldsDefinition = {}
  },

  restore(state: ForceStoreState) {
    this.globalFields = state.globalFields
    this.fieldNameIndex = state.fieldNameIndex
    this.intentions = state.intentions
    this.processes = state.processes
    this.superpositions = state.superpositions
    this.states = state.states
    this.actorParams = state.actorParams
    this.uuidToIndex = state.uuidToIndex
    this.indexToUuid = state.indexToUuid
    this.stateMaps = state.stateMaps
    this.onStateChange = state.onStateChange
    this.actorIds = state.actorIds
    this.nextFieldIndex = state.nextFieldIndex
    this.fieldsDefinition = state.fieldsDefinition
  },
}
