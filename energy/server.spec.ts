import { describe, expect, test } from "bun:test"
import type { EnergyFieldValueRecord, EnergyStore } from "./store.t"
import { FIELD_TYPE, OP, CPUWeakRuntime } from "./weak"

const createServerDomainStore = (): EnergyStore => {
  const store: EnergyStore = {
    fields: [{ type: FIELD_TYPE.F32 }],
    stringTable: [""],
    sharedBlocks: [],
    sharedValues: [],
    branes: [
      {
        localValueOffset: 0,
        localValueCount: 1,
        sharedBlockRefOffset: 0,
        sharedBlockRefCount: 0,
        stateOffset: 0,
        stateCount: 2,
        lock: false,
      },
    ],
    braneValues: [{ fieldIndex: 0, value: 11 }],
    braneSharedBlockRefs: [],
    stateTable: [
      { transitionOffset: 0, transitionCount: 1 },
      { transitionOffset: 1, transitionCount: 0 },
    ],
    transitions: [{ targetState: 1, conditionOffset: 0, conditionCount: 1 }],
    conditions: [{ fieldIndex: 0, op: OP.GT, value: 10 }],
    states: [0],
    stateNames: [["idle", "ready"]],

    getField(braneIndex: number, fieldIndex: number): EnergyFieldValueRecord | undefined {
      return this.getFieldLocation(braneIndex, fieldIndex)?.record
    },

    getFieldLocation(braneIndex: number, fieldIndex: number) {
      const brane = this.branes[braneIndex]
      if (!brane) return undefined

      const end = brane.localValueOffset + brane.localValueCount
      for (let index = brane.localValueOffset; index < end; index++) {
        const record = this.braneValues[index]
        if (record?.fieldIndex === fieldIndex) return { scope: "local" as const, record }
      }

      return undefined
    },

    getFieldValue(braneIndex: number, fieldIndex: number) {
      return this.getField(braneIndex, fieldIndex)?.value
    },

    getState(braneIndex: number, stateIndex: number) {
      const brane = this.branes[braneIndex]
      if (!brane || stateIndex < 0 || stateIndex >= brane.stateCount) return undefined
      return this.stateTable[brane.stateOffset + stateIndex]
    },

    getStateName(braneIndex: number, stateIndex: number) {
      return this.stateNames[braneIndex]?.[stateIndex]
    },
  }

  return store
}

describe("energy server domain smoke", () => {
  test("исполняет простой переход состояния в Energy Weak runtime", async () => {
    const runtime = new CPUWeakRuntime(createServerDomainStore())

    runtime.step()

    expect(await runtime.readChanges()).toEqual([[0, 1]])
  })
})
