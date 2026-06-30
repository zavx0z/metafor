/**
 * `matrix/store` — derived materialized runtime store Matrix.
 *
 * Заполняется в `matrix` после rebuild из `gravity$`,
 * читается слабым вычислительным слоем.
 *
 * @property fields {@link MatrixStore.fields|каноническая схема полей}
 * @property stringTable {@link MatrixStore.stringTable|дедуплицированная таблица строк}
 * @property sharedBlocks {@link MatrixStore.sharedBlocks|дескрипторы shared-блоков}
 * @property sharedValues {@link MatrixStore.sharedValues|значения shared-полей}
 * @property branes {@link MatrixStore.branes|плоские записи бран}
 * @property braneValues {@link MatrixStore.braneValues|локальные значения полей}
 * @property braneSharedBlockRefs {@link MatrixStore.braneSharedBlockRefs|ссылки на shared-блоки}
 * @property stateTable {@link MatrixStore.stateTable|канонический граф состояний}
 * @property transitions {@link MatrixStore.transitions|таблица переходов}
 * @property conditions {@link MatrixStore.conditions|таблица условий}
 * @property states {@link MatrixStore.states|runtime-снимок состояний}
 *
 * @see {@link MatrixStore} — тип состояния
 *
 * @packageDocumentation
 */

export type { MatrixStore, MatrixData } from "./store.t.ts"
import type {
  MatrixStore,
  MatrixFieldValueRecord,
  MatrixFieldStorageLocation,
  MatrixValue,
  MatrixStateRecord,
} from "./store.t.ts"

export const matrix$: MatrixStore = {
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

  getField(braneIndex: number, fieldIndex: number): MatrixFieldValueRecord | undefined {
    const location = this.getFieldLocation(braneIndex, fieldIndex)
    return location?.record
  },

  getFieldLocation(braneIndex: number, fieldIndex: number): MatrixFieldStorageLocation | undefined {
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

  getFieldValue(braneIndex: number, fieldIndex: number): MatrixValue | undefined {
    return this.getField(braneIndex, fieldIndex)?.value
  },

  getState(braneIndex: number, stateIndex: number): MatrixStateRecord | undefined {
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
