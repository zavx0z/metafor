import {afterEach, describe, expect, test} from "bun:test"
import type { EnergyFieldValueRecord, EnergyStore } from "./store.t"
import { FIELD_TYPE, OP, CPUWeakRuntime } from "./weak"
import {closeForceChannel, force, type EnergyParticle} from "./channel"
import {
  energy$,
  gravity$,
  listRuntimeActorIds,
  loadRuntimeSnapshot,
  subscribeEnergyGluonBroadcast,
  subscribeEnergyHiggsBroadcast,
  type EnergyRuntimeSnapshot,
} from "./energy"
import * as energyPublicApi from "./index"
import {FieldType} from "./gravity"

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

describe("energy domain smoke", () => {
  test("исполняет простой переход состояния в Energy Weak runtime", async () => {
    const runtime = new CPUWeakRuntime(createServerDomainStore())

    runtime.step()

    expect(await runtime.readChanges()).toEqual([[0, 1]])
  })
})

const createRuntimeSnapshot = (): EnergyRuntimeSnapshot => ({
  ok: true,
  version: 1,
  wimpIds: [17],
  legacyProcessActorIds: [17],
  runtime: {
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "zavx0z/full-screen"]],
    actorIdsByWimpSrc: [["zavx0z/full-screen", [17]]],
    runtimeFieldIndexByActorFieldId: [
      [17, 2, 0],
      [17, 5, 1],
      [17, 7, 2],
      [17, 9, 3],
    ],
  },
  data: {
    fields: [
      {type: FieldType.F32},
      {type: FieldType.U32, enum: ["native", "css"]},
      {type: FieldType.U32},
      {type: FieldType.ARRAY_PTR, elementType: "string"},
    ],
    branes: [
      {
        values: [
          [0, 0],
          [1, "native"],
          [2, 3],
          [3, ["seed"]],
        ],
        state: 0,
        collapses: [
          [[1, {0: {gt: 10}}]],
          [],
        ],
      },
    ],
    stateNames: [["idle", "ready"]],
  },
  strong: {
    runtimeFieldIndexByWimpFieldId: [],
    wimpFieldIdsByRuntimeFieldIndex: [[], [], [], []],
    braneIndexByWimpFieldId: [],
    topologyWimpFieldIds: [],
    topologyActorFieldIds: [[17, 5], [17, 9]],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[101, 102]],
    stateProcessIdsByBraneIndex: [[null, null]],
  },
})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Expected asynchronous Energy broadcast effect")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const settleBroadcasts = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  closeForceChannel()
})

describe("energy Force v0 runtime addressing", () => {
  test("публичный runtime identity API говорит actor, а не wimp", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())

    expect(listRuntimeActorIds()).toEqual([17])
    expect("listRuntimeWimpIds" in energyPublicApi).toBe(false)
  })

  test("gluon принимает actor ID и value.fields[fieldId], затем публикует photon с actor ID", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const photons: EnergyParticle[] = []
    const photonSubscription = force.entropy((event) => {
      photons.push(...event.data.parts.filter((part) => part.part === "photon"))
    })
    const subscription = subscribeEnergyGluonBroadcast()

    try {
      force.emit({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })

      await waitFor(() => photons.length > 0)

      expect(energy$.getFieldValue(0, 0)).toBe(11)
      expect(energy$.states[0]).toBe(1)
      expect(photons).toContainEqual({part: "photon", op: "replace", path: 17, value: "ready"})
    } finally {
      subscription.close()
      photonSubscription.close()
    }
  })

  test("gluon не применяет /field path, key-addressing и numeric order-addressing", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyGluonBroadcast()

    try {
      force.emit({
        parts: [
          {part: "gluon", op: "replace", path: "/field/2", value: {fields: {"2": 11}}},
          {part: "gluon", op: "replace", path: 17, value: {fields: {method: 11}}},
          {part: "gluon", op: "replace", path: 17, value: {fields: {"1": 11}}},
        ],
      })

      await settleBroadcasts()

      expect(energy$.getFieldValue(0, 0)).toBe(0)
      expect(energy$.states[0] ?? 0).toBe(0)
    } finally {
      subscription.close()
    }
  })

  test("higgs actor-scope не обновляет ordinary field как gluon", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyHiggsBroadcast()

    try {
      force.emit({
        parts: [{
          part: "higgs",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })

      await settleBroadcasts()

      expect(energy$.getFieldValue(0, 0)).toBe(0)
      expect(energy$.states[0] ?? 0).toBe(0)
    } finally {
      subscription.close()
    }
  })

  test("higgs actor-scope применяет topology-compatible enum field по fieldId", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyHiggsBroadcast()

    try {
      force.emit({
        parts: [{
          part: "higgs",
          op: "replace",
          path: 17,
          value: {fields: {"5": "css"}},
        }],
      })

      await waitFor(() => energy$.getFieldValue(0, 1) === 1)

      expect(energy$.getFieldValue(0, 1)).toBe(1)
    } finally {
      subscription.close()
    }
  })

  test("higgs remove сбрасывает enum field в default enum value", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyHiggsBroadcast()

    try {
      force.emit({
        parts: [{
          part: "higgs",
          op: "replace",
          path: 17,
          value: {fields: {"5": "css"}},
        }],
      })
      await waitFor(() => energy$.getFieldValue(0, 1) === 1)

      force.emit({
        parts: [{
          part: "higgs",
          op: "remove",
          path: 17,
          value: {fields: {"5": true}},
        }],
      })
      await waitFor(() => energy$.getFieldValue(0, 1) === 0)

      expect(energy$.getFieldValue(0, 1)).toBe(0)
    } finally {
      subscription.close()
    }
  })

  test("higgs remove сбрасывает array field в пустой массив и не падает", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyHiggsBroadcast()

    try {
      expect(energy$.getFieldValue(0, 3)).toEqual([1])

      force.emit({
        parts: [{
          part: "higgs",
          op: "remove",
          path: 17,
          value: {fields: {"9": true}},
        }],
      })
      await waitFor(() => {
        const value = energy$.getFieldValue(0, 3)
        return Array.isArray(value) && value.length === 0
      })

      expect(energy$.getFieldValue(0, 3)).toEqual([])
    } finally {
      subscription.close()
    }
  })

  test("голый U32 без enum не считается topology-compatible", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const higgsSubscription = subscribeEnergyHiggsBroadcast()
    const gluonSubscription = subscribeEnergyGluonBroadcast()

    try {
      force.emit({
        parts: [{
          part: "higgs",
          op: "replace",
          path: 17,
          value: {fields: {"7": 8}},
        }],
      })
      await settleBroadcasts()
      expect(energy$.getFieldValue(0, 2)).toBe(3)

      force.emit({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"7": 8}},
        }],
      })
      await waitFor(() => energy$.getFieldValue(0, 2) === 8)

      expect(energy$.getFieldValue(0, 2)).toBe(8)
    } finally {
      higgsSubscription.close()
      gluonSubscription.close()
    }
  })

  test("higgs class-scope по WIMP SRC выставляет structural invalidation без Boundary reload", async () => {
    await loadRuntimeSnapshot(createRuntimeSnapshot())
    const subscription = subscribeEnergyHiggsBroadcast()

    try {
      expect(gravity$.structuralDirty).toBe(false)

      force.emit({
        parts: [{
          part: "higgs",
          op: "replace",
          path: "zavx0z/full-screen",
          value: {fields: {"5": {key: "method", type: "enum"}}},
        }],
      })

      await waitFor(() => gravity$.structuralDirty)

      expect(gravity$.getActorIdsByWimpSrc("zavx0z/full-screen")).toEqual([17])
      expect(gravity$.structuralDirty).toBe(true)
    } finally {
      subscription.close()
    }
  })
})
