import {afterAll, describe, expect, test} from "bun:test"
import type { MatrixFieldValueRecord, MatrixStore } from "./store.t"
import { FIELD_TYPE, OP, CPUWeakRuntime } from "./weak"
import { STATE_NONE, STATE_UNDEFINED } from "./state"
import {
  force,
  matrix$,
  gravity$,
  listMatrixRuntimeActorIds,
  loadMatrixRuntimeSnapshot,
  type MatrixForceMessage,
  type MatrixParticle,
  type MatrixRuntimeSnapshot,
} from "./matrix"
import * as matrixPublicApi from "./index"
import {FieldType} from "./gravity"

const createServerDomainStore = (): MatrixStore => {
  const store: MatrixStore = {
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

    getField(braneIndex: number, fieldIndex: number): MatrixFieldValueRecord | undefined {
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

describe("matrix domain smoke", () => {
  test("исполняет простой переход состояния в Matrix Weak runtime", async () => {
    const runtime = new CPUWeakRuntime(createServerDomainStore())

    runtime.step()

    expect(await runtime.readChanges()).toEqual([[0, 1]])
  })
})

const createRuntimeSnapshot = (): MatrixRuntimeSnapshot => ({
  ok: true,
  version: 1,
  wimpIds: [17],
  legacyProcessActorIds: [17],
  runtime: {
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "zavx0z/linux"]],
    actorIdsByWimpSrc: [["zavx0z/linux", [17]]],
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
      throw new Error("Expected asynchronous Matrix broadcast effect")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const settleBroadcasts = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const forceInput = new BroadcastChannel("force")

const emitForce = (message: MatrixForceMessage): void => {
  forceInput.postMessage(message)
}

const listenForce = (listener: (message: MatrixForceMessage) => void): {close(): void} => {
  const channel = new BroadcastChannel("force")
  channel.onmessage = (event) => listener(event.data as MatrixForceMessage)
  return {
    close() {
      channel.close()
    },
  }
}

const enterReadyProcessState = async (): Promise<void> => {
  const snapshot = createRuntimeSnapshot()
  snapshot.weak.stateProcessIdsByBraneIndex = [[null, 42]]
  await loadMatrixRuntimeSnapshot(snapshot)

  emitForce({
    parts: [{
      part: "gluon",
      op: "replace",
      path: 17,
      value: {fields: {"2": 11}},
    }],
  })

  await waitFor(() => matrix$.states[0] === 1 && matrix$.branes[0]?.lock === true)
}

const acceptEnergy = async (energy: string, zCopies: MatrixParticle[] = []): Promise<void> => {
  const subscription = listenForce((message) => {
    zCopies.push(...message.parts.filter((part) => part.part === "z" && part.op === "copy"))
  })

  try {
    emitForce({
      parts: [{
        part: "z",
        op: "test",
        path: 17,
        value: {energy},
      }],
    })

    await waitFor(() => zCopies.some((part) => part.from === energy))
  } finally {
    subscription.close()
  }
}

afterAll(() => {
  forceInput.close()
  force.close()
})

describe("matrix Force v0 runtime addressing", () => {
  test("публичный runtime identity API говорит actor, а не wimp", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())
    const legacyRuntimeIdentityExport = ["listRuntime", "WimpIds"].join("")

    expect(listMatrixRuntimeActorIds()).toEqual([17])
    expect(legacyRuntimeIdentityExport in matrixPublicApi).toBe(false)
  })

  test("gluon принимает actor ID и value.fields[fieldId], затем публикует photon с actor ID", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())
    const photons: MatrixParticle[] = []
    const photonSubscription = listenForce((message) => {
      photons.push(...message.parts.filter((part) => part.part === "photon"))
    })

    try {
      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })

      await waitFor(() => photons.length > 0)

      expect(matrix$.getFieldValue(0, 0)).toBe(11)
      expect(matrix$.states[0]).toBe(1)
      expect(photons).toContainEqual({part: "photon", op: "replace", path: 17, value: "ready"})
    } finally {
      photonSubscription.close()
    }
  })

  test("Matrix emits photon but not z process-task on process-bound state", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.weak.stateProcessIdsByBraneIndex = [[null, 42]]
    await loadMatrixRuntimeSnapshot(snapshot)
    const photons: MatrixParticle[] = []
    const zParts: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      photons.push(...message.parts.filter((part) => part.part === "photon"))
      zParts.push(...message.parts.filter((part) => part.part === "z"))
    })

    try {
      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })

      await waitFor(() => photons.length > 0)
      await settleBroadcasts()

      expect(matrix$.branes[0]?.lock).toBe(true)
      expect(photons).toContainEqual({part: "photon", op: "replace", path: 17, value: "ready"})
      expect(zParts.some((part) => (part.value as {kind?: unknown} | undefined)?.kind === "process-task")).toBe(false)
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix stores process field snapshot at state entry", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.weak.stateProcessIdsByBraneIndex = [[null, 42]]
    await loadMatrixRuntimeSnapshot(snapshot)
    const zCopies: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      zCopies.push(...message.parts.filter((part) => part.part === "z" && part.op === "copy"))
    })

    try {
      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })
      await waitFor(() => matrix$.states[0] === 1 && matrix$.branes[0]?.lock === true)

      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 14}},
        }],
      })
      await waitFor(() => matrix$.getFieldValue(0, 0) === 14)

      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-local"},
        }],
      })
      await waitFor(() => zCopies.length > 0)

      expect(matrix$.getFieldValue(0, 0)).toBe(14)
      expect(zCopies[0]).toEqual({
        part: "z",
        op: "copy",
        path: 17,
        from: "energy-local",
        value: {fields: {"2": 11, "5": 0, "7": 3, "9": [1]}},
      })
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix accepts first z test with z copy", async () => {
    await enterReadyProcessState()
    const zCopies: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      zCopies.push(...message.parts.filter((part) => part.part === "z" && part.op === "copy"))
    })

    try {
      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-local"},
        }],
      })

      await waitFor(() => zCopies.length > 0)

      expect(zCopies[0]).toEqual({
        part: "z",
        op: "copy",
        path: 17,
        from: "energy-local",
        value: {fields: {"2": 11, "5": 0, "7": 3, "9": [1]}},
      })
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix ignores repeated z test after executor selected", async () => {
    await enterReadyProcessState()
    const zParts: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      zParts.push(...message.parts.filter((part) => part.part === "z"))
    })

    try {
      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-one"},
        }],
      })
      await waitFor(() => zParts.some((part) => part.op === "copy" && part.from === "energy-one"))

      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-two"},
        }],
      })
      await settleBroadcasts()

      expect(zParts.filter((part) => part.op === "copy")).toHaveLength(1)
      expect(zParts.some((part) => part.op === "copy" && part.from === "energy-two")).toBe(false)
      expect(zParts.some((part) => (part.value as {kind?: unknown} | undefined)?.kind === "rejected")).toBe(false)
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix accepts w+ actor result and unlocks", async () => {
    await enterReadyProcessState()
    await acceptEnergy("energy-local")

    const zCopies: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      zCopies.push(...message.parts.filter((part) => part.part === "z" && part.op === "copy"))
    })

    try {
      emitForce({
        parts: [{
          part: "w+",
          op: "replace",
          path: 17,
          value: {fields: {"2": 12}},
        }],
      })

      await waitFor(() => matrix$.branes[0]?.lock === false && matrix$.getFieldValue(0, 0) === 12)

      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-after"},
        }],
      })
      await settleBroadcasts()

      expect(matrix$.branes[0]?.lock).toBe(false)
      expect(matrix$.getFieldValue(0, 0)).toBe(12)
      expect(zCopies).toEqual([])
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix accepts w- actor result and unlocks", async () => {
    await enterReadyProcessState()
    await acceptEnergy("energy-local")

    const zCopies: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      zCopies.push(...message.parts.filter((part) => part.part === "z" && part.op === "copy"))
    })

    try {
      emitForce({
        parts: [{
          part: "w-",
          op: "replace",
          path: 17,
          value: {error: "failed", fields: {"2": 13}},
        }],
      })

      await waitFor(() => matrix$.branes[0]?.lock === false && matrix$.getFieldValue(0, 0) === 13)

      emitForce({
        parts: [{
          part: "z",
          op: "test",
          path: 17,
          value: {energy: "energy-after"},
        }],
      })
      await settleBroadcasts()

      expect(matrix$.branes[0]?.lock).toBe(false)
      expect(matrix$.getFieldValue(0, 0)).toBe(13)
      expect(zCopies).toEqual([])
    } finally {
      forceSubscription.close()
    }
  })

  test("Matrix emits photon and locks on first process-bound runtime undefined entry", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0]!.state = STATE_UNDEFINED
    snapshot.weak.stateProcessIdsByBraneIndex = [[42, null]]
    const photons: MatrixParticle[] = []
    const zParts: MatrixParticle[] = []
    const forceSubscription = listenForce((message) => {
      photons.push(...message.parts.filter((part) => part.part === "photon"))
      zParts.push(...message.parts.filter((part) => part.part === "z"))
    })

    try {
      await settleBroadcasts()
      await loadMatrixRuntimeSnapshot(snapshot)
      await waitFor(() => photons.length > 0)

      expect(matrix$.states[0]).toBe(0)
      expect(matrix$.branes[0]?.lock).toBe(true)
      expect(photons).toContainEqual({part: "photon", op: "replace", path: 17, value: "idle"})
      expect(zParts.some((part) => (part.value as {kind?: unknown} | undefined)?.kind === "process-task")).toBe(false)
    } finally {
      forceSubscription.close()
    }
  })

  test("non-process runtime undefined entry unlocks brane for next Matrix update", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0]!.state = STATE_UNDEFINED
    snapshot.weak.stateProcessIdsByBraneIndex = [[null, null]]

    await loadMatrixRuntimeSnapshot(snapshot)

    expect(matrix$.states[0]).toBe(0)
    expect(matrix$.branes[0]?.lock).toBe(false)

    const photons: MatrixParticle[] = []
    const photonSubscription = listenForce((message) => {
      photons.push(...message.parts.filter((part) => part.part === "photon"))
    })

    try {
      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 11}},
        }],
      })

      await waitFor(() =>
        photons.some((part) => part.part === "photon" && part.path === 17 && part.value === "ready")
      )

      expect(matrix$.states[0]).toBe(1)
      expect(photons).toContainEqual({part: "photon", op: "replace", path: 17, value: "ready"})
    } finally {
      photonSubscription.close()
    }
  })

  test("actor без state graph остаётся адресуемым для field updates и не даёт Weak changes", async () => {
    const snapshot = createRuntimeSnapshot()
    snapshot.data.branes[0] = {
      values: snapshot.data.branes[0]!.values,
      state: STATE_NONE,
      collapses: [],
    }
    snapshot.data.stateNames = [[]]
    snapshot.weak.stateMetaStateIdsByBraneIndex = [[]]
    snapshot.weak.stateProcessIdsByBraneIndex = [[]]
    await loadMatrixRuntimeSnapshot(snapshot)
    const photons: MatrixParticle[] = []
    const photonSubscription = listenForce((message) => {
      photons.push(...message.parts.filter((part) => part.part === "photon"))
    })

    try {
      emitForce({
        parts: [{
          part: "gluon",
          op: "replace",
          path: 17,
          value: {fields: {"2": 14}},
        }],
      })

      await waitFor(() => matrix$.getFieldValue(0, 0) === 14)

      expect(matrix$.states[0]).toBe(STATE_NONE)
      expect(matrix$.getFieldValue(0, 0)).toBe(14)
      expect(photons).toEqual([])
    } finally {
      photonSubscription.close()
    }
  })

  test("gluon не применяет /field path, key-addressing и numeric order-addressing", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    emitForce({
      parts: [
        {part: "gluon", op: "replace", path: "/field/2", value: {fields: {"2": 11}}},
        {part: "gluon", op: "replace", path: 17, value: {fields: {method: 11}}},
        {part: "gluon", op: "replace", path: 17, value: {fields: {"1": 11}}},
      ],
    })

    await settleBroadcasts()

    expect(matrix$.getFieldValue(0, 0)).toBe(0)
    expect(matrix$.states[0] ?? 0).toBe(0)
  })

  test("higgs actor-scope не обновляет ordinary field как gluon", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    emitForce({
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"2": 11}},
      }],
    })

    await settleBroadcasts()

    expect(matrix$.getFieldValue(0, 0)).toBe(0)
    expect(matrix$.states[0] ?? 0).toBe(0)
  })

  test("higgs actor-scope применяет topology-compatible enum field по fieldId", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    emitForce({
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"5": "css"}},
      }],
    })

    await waitFor(() => matrix$.getFieldValue(0, 1) === 1)

    expect(matrix$.getFieldValue(0, 1)).toBe(1)
  })

  test("higgs remove сбрасывает enum field в default enum value", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    emitForce({
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"5": "css"}},
      }],
    })
    await waitFor(() => matrix$.getFieldValue(0, 1) === 1)

    emitForce({
      parts: [{
        part: "higgs",
        op: "remove",
        path: 17,
        value: {fields: {"5": true}},
      }],
    })
    await waitFor(() => matrix$.getFieldValue(0, 1) === 0)

    expect(matrix$.getFieldValue(0, 1)).toBe(0)
  })

  test("higgs remove сбрасывает array field в пустой массив и не падает", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    expect(matrix$.getFieldValue(0, 3)).toEqual([1])

    emitForce({
      parts: [{
        part: "higgs",
        op: "remove",
        path: 17,
        value: {fields: {"9": true}},
      }],
    })
    await waitFor(() => {
      const value = matrix$.getFieldValue(0, 3)
      return Array.isArray(value) && value.length === 0
    })

    expect(matrix$.getFieldValue(0, 3)).toEqual([])
  })

  test("голый U32 без enum не считается topology-compatible", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    emitForce({
      parts: [{
        part: "higgs",
        op: "replace",
        path: 17,
        value: {fields: {"7": 8}},
      }],
    })
    await settleBroadcasts()
    expect(matrix$.getFieldValue(0, 2)).toBe(3)

    emitForce({
      parts: [{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"7": 8}},
      }],
    })
    await waitFor(() => matrix$.getFieldValue(0, 2) === 8)

    expect(matrix$.getFieldValue(0, 2)).toBe(8)
  })

  test("higgs class-scope по WIMP SRC выставляет structural invalidation без Boundary reload", async () => {
    await loadMatrixRuntimeSnapshot(createRuntimeSnapshot())

    expect(gravity$.structuralDirty).toBe(false)

    emitForce({
      parts: [{
        part: "higgs",
        op: "replace",
        path: "zavx0z/linux",
        value: {fields: {"5": {key: "method", type: "enum"}}},
      }],
    })

    await waitFor(() => gravity$.structuralDirty)

    expect(gravity$.getActorIdsByWimpSrc("zavx0z/linux")).toEqual([17])
    expect(gravity$.structuralDirty).toBe(true)
  })
})
