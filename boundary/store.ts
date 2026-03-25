/**
 * `@boundary/boundary/store` — derived materialized runtime store Boundary.
 *
 * Заполняется в `@boundary/boundary` после rebuild из `gravity$`,
 * читается слабым вычислительным слоем.
 *
 * @property fields {@link BoundaryStore.fields|каноническая схема полей}
 * @property stringTable {@link BoundaryStore.stringTable|дедуплицированная таблица строк}
 * @property sharedBlocks {@link BoundaryStore.sharedBlocks|дескрипторы shared-блоков}
 * @property sharedValues {@link BoundaryStore.sharedValues|значения shared-полей}
 * @property branes {@link BoundaryStore.branes|плоские записи бран}
 * @property braneValues {@link BoundaryStore.braneValues|локальные значения полей}
 * @property braneSharedBlockRefs {@link BoundaryStore.braneSharedBlockRefs|ссылки на shared-блоки}
 * @property stateTable {@link BoundaryStore.stateTable|канонический граф состояний}
 * @property transitions {@link BoundaryStore.transitions|таблица переходов}
 * @property conditions {@link BoundaryStore.conditions|таблица условий}
 * @property states {@link BoundaryStore.states|runtime-снимок состояний}
 *
 * @see {@link BoundaryStore} — тип состояния
 *
 * @packageDocumentation
 */

export type { BoundaryStore, BoundaryData } from "./store.t.ts"
import type {
  BoundaryStore,
  BoundaryFieldValueRecord,
  BoundaryFieldStorageLocation,
  BoundaryValue,
  BoundaryStateRecord,
} from "./store.t.ts"

export const boundary$: BoundaryStore = {
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

  getField(braneIndex: number, fieldIndex: number): BoundaryFieldValueRecord | undefined {
    const location = this.getFieldLocation(braneIndex, fieldIndex)
    return location?.record
  },

  getFieldLocation(braneIndex: number, fieldIndex: number): BoundaryFieldStorageLocation | undefined {
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

  getFieldValue(braneIndex: number, fieldIndex: number): BoundaryValue | undefined {
    return this.getField(braneIndex, fieldIndex)?.value
  },

  getState(braneIndex: number, stateIndex: number): BoundaryStateRecord | undefined {
    const brane = this.branes[braneIndex]
    if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) {
      return undefined
    }

    return this.stateTable[brane.stateOffset + stateIndex]
  },
}
