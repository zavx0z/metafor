/**
 * `@energy/energy/store` — derived materialized runtime store Energy.
 *
 * Заполняется в `@energy/energy` после rebuild из `gravity$`,
 * читается слабым вычислительным слоем.
 *
 * @property fields {@link EnergyStore.fields|каноническая схема полей}
 * @property stringTable {@link EnergyStore.stringTable|дедуплицированная таблица строк}
 * @property sharedBlocks {@link EnergyStore.sharedBlocks|дескрипторы shared-блоков}
 * @property sharedValues {@link EnergyStore.sharedValues|значения shared-полей}
 * @property branes {@link EnergyStore.branes|плоские записи бран}
 * @property braneValues {@link EnergyStore.braneValues|локальные значения полей}
 * @property braneSharedBlockRefs {@link EnergyStore.braneSharedBlockRefs|ссылки на shared-блоки}
 * @property stateTable {@link EnergyStore.stateTable|канонический граф состояний}
 * @property transitions {@link EnergyStore.transitions|таблица переходов}
 * @property conditions {@link EnergyStore.conditions|таблица условий}
 * @property states {@link EnergyStore.states|runtime-снимок состояний}
 *
 * @see {@link EnergyStore} — тип состояния
 *
 * @packageDocumentation
 */

export type { EnergyStore, EnergyData } from "./store.t.ts"
import type {
  EnergyStore,
  EnergyFieldValueRecord,
  EnergyFieldStorageLocation,
  EnergyValue,
  EnergyStateRecord,
} from "./store.t.ts"

export const energy$: EnergyStore = {
  fields: [],
  stringTable: [""],
  sharedBlocks: [],
  sharedValues: [],
  branes: [],
  braneValues: [],
  braneSharedBlockRefs: [],
  stateTable: [],
  transitions: [],
  conditions: [],
  states: [],
  stateNames: [],

  getField(braneIndex: number, fieldIndex: number): EnergyFieldValueRecord | undefined {
    const location = this.getFieldLocation(braneIndex, fieldIndex)
    return location?.record
  },

  getFieldLocation(braneIndex: number, fieldIndex: number): EnergyFieldStorageLocation | undefined {
    const brane = this.branes[braneIndex]
    if (!brane) {
      return undefined
    }

    const localValueEnd = brane.localValueOffset + brane.localValueCount
    for (let valueIndex = brane.localValueOffset; valueIndex < localValueEnd; valueIndex++) {
      const record = this.braneValues[valueIndex]
      if (record?.fieldIndex === fieldIndex) {
        return { scope: "local", record }
      }
    }

    const sharedRefEnd = brane.sharedBlockRefOffset + brane.sharedBlockRefCount
    for (let refIndex = brane.sharedBlockRefOffset; refIndex < sharedRefEnd; refIndex++) {
      const blockIndex = this.braneSharedBlockRefs[refIndex]
      if (blockIndex === undefined) {
        continue
      }

      const block = this.sharedBlocks[blockIndex]
      if (!block) {
        continue
      }

      const blockValueEnd = block.valueOffset + block.valueCount
      for (let valueIndex = block.valueOffset; valueIndex < blockValueEnd; valueIndex++) {
        const record = this.sharedValues[valueIndex]
        if (record?.fieldIndex === fieldIndex) {
          return { scope: "shared", blockIndex, record }
        }
      }
    }

    return undefined
  },

  getFieldValue(braneIndex: number, fieldIndex: number): EnergyValue | undefined {
    return this.getField(braneIndex, fieldIndex)?.value
  },

  getState(braneIndex: number, stateIndex: number): EnergyStateRecord | undefined {
    const brane = this.branes[braneIndex]
    if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) {
      return undefined
    }

    return this.stateTable[brane.stateOffset + stateIndex]
  },

  getStateName(braneIndex: number, stateIndex: number): string | undefined {
    const braneStateNames = this.stateNames[braneIndex]
    if (!braneStateNames || stateIndex < 0 || stateIndex >= braneStateNames.length) {
      return undefined
    }
    return braneStateNames[stateIndex]
  },
}
