import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import type {Particle} from "shared/protocol/force/particle"
import {gravity$} from "@matrix/gravity/store.ts"
import {strong$} from "@matrix/strong"
import {StepMode, weak$, weakHeapUpdate, weakRunStep, weakStructuralUpdate} from "@matrix/weak"
import {installTestGpuDevice} from "./weak/tests/shared/gpu.ts"
import {applyIncrementalMatrixProjection} from "./incremental.ts"
import {applyMatrixProjectionParticle, recordMatrixProjectionState} from "./projection.ts"
import {matrix$} from "./store.ts"
import {prepareIncrementalMatrixFixture} from "./tests/shared/fixtures.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

beforeEach(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterEach(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const largeProjection = (count: number): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: Array.from({length: count}, (_, index) => ({
    id: index + 1,
    wimp: "owner/large",
    values: [{field: 101, valueId: 10_000 + index, value: index}],
    state: null,
  })),
  declarations: [{
    src: "owner/large",
    section: "fields",
    localId: "1",
    value: {id: 101, key: "value", type: "number", default: 0, position: 0},
  }],
})

const replaceAtom = (atomId: number, valueId: number, value: number): Particle => ({
  part: "graviton",
  op: "replace",
  path: `atom/${atomId}`,
  by: "boundary",
  ts: 2,
  value: {
    atom: {id: atomId, parentAtom: null, parentTopology: null, wimp: "owner/large", position: atomId - 1},
    values: [{atom: atomId, field: 101, value: valueId}],
    valueRecords: [{id: valueId, kind: "number", number: value}],
    valueItems: [],
    state: {atom: atomId, metaState: null},
  },
})

const statefulProjection = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [{id: 10, wimp: "owner/stateful", values: [{field: 101, valueId: 501, value: 0}], state: null}],
  declarations: [
    {src: "owner/stateful", section: "fields", localId: "1", value: {id: 101, key: "value", type: "number", default: 0, position: 0}},
    {src: "owner/stateful", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
    {src: "owner/stateful", section: "states", localId: "2", value: {id: 202, name: "ready", position: 1}},
    {src: "owner/stateful", section: "transitions", localId: "1", value: {id: 301, fromState: 201, toState: 202, position: 0}},
    {src: "owner/stateful", section: "conditions", localId: "1", value: {id: 401, transition: 301, field: 101, predicate: {gt: 10}, position: 0}},
  ],
})

const addStatefulAtom = (): Particle => ({
  part: "graviton",
  op: "add",
  path: "atom/11",
  by: "boundary",
  ts: 2,
  value: {
    atom: {id: 11, parentAtom: null, parentTopology: null, wimp: "owner/stateful", position: 1},
    values: [{atom: 11, field: 101, value: 502}],
    valueRecords: [{id: 502, kind: "number", number: 11}],
    valueItems: [],
    state: {atom: 11, metaState: null},
  },
})

const removeStatefulAtom = (): Particle => ({
  part: "graviton",
  op: "remove",
  path: "atom/11",
  by: "boundary",
  ts: 2,
})

const sharedSplitProjection = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: Array.from({length: 4}, (_, index) => ({
    id: index + 1,
    wimp: "owner/shared-split",
    values: [{field: 101, valueId: 10, value: 10}],
    state: null,
  })),
  declarations: [{
    src: "owner/shared-split",
    section: "fields",
    localId: "1",
    value: {id: 101, key: "value", type: "number", default: 0, position: 0},
  }],
})

const replaceSharedSplitAtom = (atomId: number, valueId: number): Particle => ({
  part: "graviton",
  op: "replace",
  path: `atom/${atomId}`,
  by: "boundary",
  ts: 2,
  value: {
    atom: {id: atomId, parentAtom: null, parentTopology: null, wimp: "owner/shared-split", position: atomId - 1},
    values: [{atom: atomId, field: 101, value: valueId}],
    valueRecords: [{id: valueId, kind: "number", number: valueId}],
    valueItems: [],
    state: {atom: atomId, metaState: null},
  },
})

const sharedGraphProjection = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [1, 2].map((id) => ({
    id,
    wimp: "owner/shared-graph",
    values: [{field: 101, valueId: 10, value: 0}],
    state: null,
  })),
  declarations: [
    {src: "owner/shared-graph", section: "fields", localId: "1", value: {id: 101, key: "value", type: "number", default: 0, position: 0}},
    {src: "owner/shared-graph", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
    {src: "owner/shared-graph", section: "states", localId: "2", value: {id: 202, name: "done", position: 1}},
    {src: "owner/shared-graph", section: "transitions", localId: "1", value: {id: 301, fromState: 201, toState: 202, position: 0}},
    {src: "owner/shared-graph", section: "conditions", localId: "1", value: {id: 401, transition: 301, field: 101, predicate: {gt: 5}, position: 0}},
  ],
})

const sharedGraphField = (valueId: number, value: number): Particle => ({
  part: "graviton",
  op: "replace",
  path: "atom/2",
  by: "boundary",
  ts: 2,
  value: {
    atom: {id: 2, parentAtom: null, parentTopology: null, wimp: "owner/shared-graph", position: 1},
    values: [{atom: 2, field: 101, value: valueId}],
    valueRecords: [{id: valueId, kind: "number", number: value}],
    valueItems: [],
    state: {atom: 2, metaState: 201},
  },
})

const enumProjection = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [{
    id: 1,
    wimp: "owner/enum",
    values: [{field: 101, valueId: 501, value: {kind: "enum", variant: 201}}],
    state: null,
  }],
  declarations: [
    {src: "owner/enum", section: "fields", localId: "1", value: {id: 101, key: "mode", type: "enum", default: {kind: "enum", variant: 201}, position: 0}},
    {src: "owner/enum", section: "variants", localId: "1", value: {id: 201, field: 101, itemValue: "old", position: 0}},
    {src: "owner/enum", section: "variants", localId: "2", value: {id: 202, field: 101, itemValue: "other", position: 1}},
    {src: "owner/enum", section: "states", localId: "1", value: {id: 301, name: "idle", position: 0}},
    {src: "owner/enum", section: "states", localId: "2", value: {id: 302, name: "done", position: 1}},
    {src: "owner/enum", section: "transitions", localId: "1", value: {id: 401, fromState: 301, toState: 302, position: 0}},
    {src: "owner/enum", section: "conditions", localId: "1", value: {id: 402, transition: 401, field: 101, predicate: {eq: {kind: "enum", variant: 201}}, position: 0}},
  ],
})

const variantParticle = (
  op: "replace" | "remove",
  localId: number,
  id: number,
  itemValue?: string,
  position?: number,
): Particle => ({
  part: "graviton",
  op,
  path: "variant",
  by: "boundary",
  ts: 2,
  value: {
    wimp: "owner/enum",
    localId,
    id,
    ...(itemValue === undefined ? {} : {field: 101, itemValue}),
    ...(position === undefined ? {} : {position}),
  },
})

describe("Matrix incremental structural runtime", () => {
  test("touches one brane in a 1000-Atom projection and keeps the backend", async () => {
    await prepareIncrementalMatrixFixture(largeProjection(1000))
    const untouched = matrix$.branes[0]
    const targetIndex = gravity$.getBraneIndexByAtomId(1000)
    const target = targetIndex === undefined ? undefined : matrix$.branes[targetIndex]
    const runtime = weak$.runtime

    const change = applyMatrixProjectionParticle(replaceAtom(1000, 10_999, 42))
    const result = await applyIncrementalMatrixProjection(change)
    weakStructuralUpdate(result.weakUpdate)

    expect(result.stats).toMatchObject({
      projectionAtoms: 1,
      touchedBranes: 1,
      reusedBranes: 1,
      appendedBranes: 0,
    })
    expect(matrix$.branes[0]).toBe(untouched)
    expect(matrix$.branes[targetIndex!]).toBe(target)
    const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(`${1000}\0${101}`)
    expect(matrix$.getFieldValue(targetIndex!, fieldIndex!)).toBe(42)
    expect(weak$.runtime).toBe(runtime)
  })

  test("reuses packed storage across repeated same-shape structural updates", async () => {
    await prepareIncrementalMatrixFixture(largeProjection(1000))
    const sizes = () => ({
      fields: matrix$.fields.length,
      braneValues: matrix$.braneValues.length,
      sharedBlocks: matrix$.sharedBlocks.length,
      sharedValues: matrix$.sharedValues.length,
      stateTable: matrix$.stateTable.length,
      transitions: matrix$.transitions.length,
      conditions: matrix$.conditions.length,
    })
    const before = sizes()

    for (let value = 1; value <= 100; value++) {
      const result = await applyIncrementalMatrixProjection(
        applyMatrixProjectionParticle(replaceAtom(1000, 10_999, value)),
      )
      expect(result.stats.projectionAtoms).toBe(1)
    }

    expect(sizes()).toEqual(before)
  })

  test("keeps distinct shared blocks when one family splits into two", async () => {
    const run = async (backend: "cpu" | "gpu") => {
      if (backend === "gpu") await installTestGpuDevice()
      Bun.env.METAFOR_WEAK_BACKEND = backend
      await prepareIncrementalMatrixFixture(sharedSplitProjection())
      const runtime = weak$.runtime
      for (const atomId of [3, 4]) {
        const result = await applyIncrementalMatrixProjection(
          applyMatrixProjectionParticle(replaceSharedSplitAtom(atomId, 20)),
        )
        weakStructuralUpdate(result.weakUpdate)
      }
      await weakRunStep(StepMode.UndefinedOnly)

      const fields = [1, 2, 3, 4].map((atomId) =>
        strong$.runtimeFieldIndexByAtomFieldId.get(`${atomId}\0${101}`)!,
      )
      const branes = [1, 2, 3, 4].map((atomId) => gravity$.getBraneIndexByAtomId(atomId)!)
      const locations = branes.map((braneIndex, index) =>
        matrix$.getFieldLocation(braneIndex, fields[index]!),
      )
      const trace = {
        fields,
        blocks: locations.map((location) => location?.scope === "shared" ? location.blockIndex : -1),
        values: branes.map((braneIndex, index) => matrix$.getFieldValue(braneIndex, fields[index]!)),
        sharedBlocks: matrix$.sharedBlocks.length,
      }
      expect(weak$.runtime).toBe(runtime)
      weak$.dispose()
      return trace
    }

    const cpu = await run("cpu")
    const gpu = await run("gpu")
    expect(gpu).toEqual(cpu)
    expect(cpu.values).toEqual([10, 10, 20, 20])
    expect(cpu.blocks[0]).toBe(cpu.blocks[1])
    expect(cpu.blocks[2]).toBe(cpu.blocks[3])
    expect(cpu.blocks[0]).not.toBe(cpu.blocks[2])
    expect(cpu.sharedBlocks).toBe(2)
  })

  test("copy-on-writes a deduplicated graph when a shared Field splits", async () => {
    const run = async (backend: "cpu" | "gpu") => {
      if (backend === "gpu") await installTestGpuDevice()
      Bun.env.METAFOR_WEAK_BACKEND = backend
      await prepareIncrementalMatrixFixture(sharedGraphProjection())
      expect(matrix$.branes[0]?.stateOffset).toBe(matrix$.branes[1]?.stateOffset)
      await weakRunStep(StepMode.UndefinedOnly)
      recordMatrixProjectionState(1, 201)
      recordMatrixProjectionState(2, 201)

      const result = await applyIncrementalMatrixProjection(
        applyMatrixProjectionParticle(sharedGraphField(20, 20)),
      )
      weakStructuralUpdate(result.weakUpdate)

      const fieldIndexes = [1, 2].map((atomId) =>
        strong$.runtimeFieldIndexByAtomFieldId.get(`${atomId}\0${101}`)!,
      )
      const conditionFieldIndexes = [0, 1].map((braneIndex) => {
        const idle = matrix$.getState(braneIndex, 0)!
        const transition = matrix$.transitions[idle.transitionOffset]!
        return matrix$.conditions[transition.conditionOffset]!.fieldIndex
      })
      const trace = {
        stateOffsets: matrix$.branes.map((brane) => brane.stateOffset),
        fieldIndexes,
        conditionFieldIndexes,
        values: [0, 1].map((braneIndex) => matrix$.getFieldValue(braneIndex, fieldIndexes[braneIndex]!)),
        evolved: await weakRunStep(StepMode.Full),
      }
      weak$.dispose()
      return trace
    }

    const cpu = await run("cpu")
    const gpu = await run("gpu")
    expect(gpu).toEqual(cpu)
    expect(cpu.stateOffsets[0]).not.toBe(cpu.stateOffsets[1])
    expect(cpu.conditionFieldIndexes).toEqual(cpu.fieldIndexes)
    expect(cpu.values).toEqual([0, 20])
    expect(cpu.evolved).toEqual([[1, 1]])
  })

  test("bounds graph copy-on-write storage across repeated split-join churn", async () => {
    await prepareIncrementalMatrixFixture(sharedGraphProjection())
    await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(sharedGraphField(20, 20)))
    const sizes = () => [matrix$.stateTable.length, matrix$.transitions.length, matrix$.conditions.length]
    const warmed = sizes()

    for (let cycle = 0; cycle < 100; cycle++) {
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(sharedGraphField(10, 0)))
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(sharedGraphField(20, 20)))
    }

    expect(warmed).toEqual([4, 2, 2])
    expect(sizes()).toEqual(warmed)
  })

  test("preserves Variant identity across rename, reorder and unreferenced removal", async () => {
    const run = async (backend: "cpu" | "gpu") => {
      if (backend === "gpu") await installTestGpuDevice()
      Bun.env.METAFOR_WEAK_BACKEND = backend
      await prepareIncrementalMatrixFixture(enumProjection())
      const runtime = weak$.runtime
      const trace: Array<{variants: unknown[]; value: unknown; condition: unknown}> = []
      const capture = () => {
        const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(`${1}\0${101}`)!
        const idle = matrix$.getState(0, 0)!
        const transition = matrix$.transitions[idle.transitionOffset]!
        trace.push({
          variants: [...(matrix$.fields[fieldIndex]?.enum ?? [])],
          value: matrix$.getFieldValue(0, fieldIndex),
          condition: matrix$.conditions[transition.conditionOffset]?.value,
        })
      }
      const apply = async (particle: Particle) => {
        const result = await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(particle))
        weakStructuralUpdate(result.weakUpdate)
        capture()
      }

      capture()
      await apply(variantParticle("replace", 1, 201, "new", 0))
      await apply(variantParticle("replace", 1, 201, "new", 1))
      await apply(variantParticle("replace", 2, 202, "other", 0))
      await apply(variantParticle("remove", 2, 202))
      await weakRunStep(StepMode.UndefinedOnly)
      expect(weak$.runtime).toBe(runtime)
      weak$.dispose()
      return trace
    }

    const cpu = await run("cpu")
    const gpu = await run("gpu")
    expect(gpu).toEqual(cpu)
    expect(cpu).toEqual([
      {variants: ["old", "other"], value: 0, condition: 0},
      {variants: ["new", "other"], value: 0, condition: 0},
      {variants: ["new", "other"], value: 0, condition: 0},
      {variants: ["other", "new"], value: 1, condition: 1},
      {variants: ["new"], value: 0, condition: 0},
    ])
  })

  test("accepts a Field before its enum Variants and resolves the default incrementally", async () => {
    await prepareIncrementalMatrixFixture({
      version: 1,
      pendingProcessExecutions: [],
      atoms: [{id: 1, wimp: "owner/streamed-enum", values: [], state: null}],
      declarations: [],
    })
    const apply = async (particle: Particle) => {
      const result = await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(particle))
      weakStructuralUpdate(result.weakUpdate)
      const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(`${1}\0${101}`)
      return fieldIndex === undefined ? undefined : matrix$.getFieldValue(0, fieldIndex)
    }

    expect(await apply({
      part: "graviton",
      op: "add",
      path: "field",
      by: "boundary",
      ts: 2,
      value: {
        wimp: "owner/streamed-enum",
        localId: 1,
        id: 101,
        key: "mode",
        type: "enum",
        default: {kind: "enum", variant: 202},
        position: 0,
      },
    })).toBeNull()
    expect(await apply({
      part: "graviton",
      op: "add",
      path: "variant",
      by: "boundary",
      ts: 3,
      value: {
        wimp: "owner/streamed-enum",
        localId: 1,
        id: 201,
        field: 101,
        itemValue: "idle",
        position: 0,
      },
    })).toBeNull()
    expect(await apply({
      part: "graviton",
      op: "add",
      path: "variant",
      by: "boundary",
      ts: 4,
      value: {
        wimp: "owner/streamed-enum",
        localId: 2,
        id: 202,
        field: 101,
        itemValue: "ready",
        position: 1,
      },
    })).toBe(1)
  })

  test("bounds canonical packed storage while the shape grows", async () => {
    await prepareIncrementalMatrixFixture(largeProjection(1))

    for (let localId = 2; localId <= 100; localId++) {
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle({
        part: "graviton",
        op: "add",
        path: "field",
        by: "boundary",
        ts: localId,
        value: {
          wimp: "owner/large",
          localId,
          id: 100 + localId,
          key: `value-${localId}`,
          type: "number",
          default: localId,
          position: localId - 1,
        },
      }))
    }

    expect(matrix$.branes[0]?.localValueCount).toBe(100)
    expect(matrix$.braneValues.length).toBeLessThanOrEqual(300)
  })

  test("reuses shared payload storage across shared-local churn", async () => {
    const initial = sharedSplitProjection()
    initial.atoms = initial.atoms.slice(0, 2)
    await prepareIncrementalMatrixFixture(initial)
    const warmedSharedValues = matrix$.sharedValues.length

    for (let cycle = 0; cycle < 100; cycle++) {
      await applyIncrementalMatrixProjection(
        applyMatrixProjectionParticle(replaceSharedSplitAtom(4, 1000 + cycle)),
      )
      await applyIncrementalMatrixProjection(
        applyMatrixProjectionParticle(replaceSharedSplitAtom(4, 10)),
      )
    }

    expect(matrix$.sharedValues.length).toBe(warmedSharedValues)
  })

  test("reuses Field, brane value and graph storage across repeated add/remove churn", async () => {
    await prepareIncrementalMatrixFixture(statefulProjection())
    await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(addStatefulAtom()))
    const runtime = weak$.runtime
    const brane = matrix$.branes[1]
    const sizes = () => ({
      fields: matrix$.fields.length,
      branes: matrix$.branes.length,
      braneValues: matrix$.braneValues.length,
      stateTable: matrix$.stateTable.length,
      transitions: matrix$.transitions.length,
      conditions: matrix$.conditions.length,
    })
    const warmed = sizes()

    for (let cycle = 0; cycle < 100; cycle++) {
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(removeStatefulAtom()))
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(addStatefulAtom()))
    }

    expect(sizes()).toEqual(warmed)
    expect(matrix$.branes[1]).toBe(brane)
    expect(gravity$.getBraneIndexByAtomId(11)).toBe(1)
    expect(weak$.runtime).toBe(runtime)
  })

  test("reuses canonical graph ranges when a Condition changes", async () => {
    await prepareIncrementalMatrixFixture(statefulProjection())
    const before = {
      states: matrix$.stateTable.length,
      transitions: matrix$.transitions.length,
      conditions: matrix$.conditions.length,
    }

    for (let value = 11; value <= 110; value++) {
      await applyIncrementalMatrixProjection(applyMatrixProjectionParticle({
        part: "graviton",
        op: "replace",
        path: "condition",
        by: "boundary",
        ts: value,
        value: {
          wimp: "owner/stateful",
          localId: 1,
          id: 401,
          transition: 301,
          field: 101,
          predicate: {gt: value},
          position: 0,
        },
      }))
    }

    expect({
      states: matrix$.stateTable.length,
      transitions: matrix$.transitions.length,
      conditions: matrix$.conditions.length,
    }).toEqual(before)
  })

  test("invalidates a locked execution only when its Process declaration changes", async () => {
    const initial: BoundaryInitialState = {
      version: 1,
      pendingProcessExecutions: [],
      atoms: [{id: 17, wimp: "owner/process", values: [], state: 202}],
      declarations: [
        {src: "owner/process", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
        {src: "owner/process", section: "states", localId: "2", value: {id: 202, name: "ready", position: 1}},
        {src: "owner/process", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
      ],
    }
    await prepareIncrementalMatrixFixture(initial)
    const brane = matrix$.branes[0]!
    brane.lock = true

    const change = applyMatrixProjectionParticle({
      part: "graviton",
      op: "replace",
      path: "process",
      by: "boundary",
      ts: 2,
      value: {wimp: "owner/process", localId: 1, id: 501, key: "ready", state: "ready", revision: 2},
    })
    const result = await applyIncrementalMatrixProjection(change)

    expect(change.invalidatedProcessWimps).toEqual(["owner/process"])
    expect(result.invalidatedAtomIds).toEqual([17])
    expect(result.processCandidateBraneIndexes).toEqual([0])
    expect(matrix$.branes[0]).toBe(brane)
    expect(brane.lock).toBe(false)
  })

  test("invalidates a locked execution when the same Atom is retargeted to another WIMP", async () => {
    const initial: BoundaryInitialState = {
      version: 1,
      pendingProcessExecutions: [],
      atoms: [{id: 17, wimp: "owner/old", values: [], state: 202}],
      declarations: [
        {src: "owner/old", section: "states", localId: "1", value: {id: 202, name: "ready", position: 0}},
        {src: "owner/old", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
        {src: "owner/new", section: "states", localId: "1", value: {id: 302, name: "ready", position: 0}},
        {src: "owner/new", section: "processes", localId: "1", value: {id: 601, key: "ready", state: "ready"}},
      ],
    }
    await prepareIncrementalMatrixFixture(initial)
    const brane = matrix$.branes[0]!
    brane.lock = true

    const change = applyMatrixProjectionParticle({
      part: "graviton",
      op: "replace",
      path: "atom/17",
      by: "boundary",
      ts: 2,
      value: {
        atom: {id: 17, parentAtom: null, parentTopology: null, wimp: "owner/new", position: 0},
        values: [],
        valueRecords: [],
        valueItems: [],
        state: {atom: 17, metaState: 302},
      },
    })
    const result = await applyIncrementalMatrixProjection(change)

    expect(change.invalidatedProcessAtomIds).toEqual([17])
    expect(result.invalidatedAtomIds).toEqual([17])
    expect(matrix$.branes[0]).toBe(brane)
    expect(brane.lock).toBe(false)
  })

  test("rebuilds every Atom of a changed WIMP and invalidates their old Processes only", async () => {
    const initial: BoundaryInitialState = {
      version: 1,
      pendingProcessExecutions: [],
      atoms: [
        {id: 17, wimp: "owner/fanout", values: [], state: 202},
        {id: 18, wimp: "owner/fanout", values: [], state: 202},
        {id: 19, wimp: "owner/peer", values: [], state: 302},
      ],
      declarations: [
        {src: "owner/fanout", section: "states", localId: "1", value: {id: 202, name: "ready", position: 0}},
        {src: "owner/fanout", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
        {src: "owner/peer", section: "states", localId: "1", value: {id: 302, name: "ready", position: 0}},
        {src: "owner/peer", section: "processes", localId: "1", value: {id: 601, key: "ready", state: "ready"}},
      ],
    }
    await prepareIncrementalMatrixFixture(initial)
    const firstIndex = gravity$.getBraneIndexByAtomId(17)!
    const secondIndex = gravity$.getBraneIndexByAtomId(18)!
    const peerIndex = gravity$.getBraneIndexByAtomId(19)!
    const first = matrix$.branes[firstIndex]!
    const second = matrix$.branes[secondIndex]!
    const peer = matrix$.branes[peerIndex]!
    first.lock = true
    second.lock = true
    peer.lock = true

    const change = applyMatrixProjectionParticle({
      part: "graviton",
      op: "replace",
      path: "matter",
      by: "boundary",
      ts: 2,
      value: {wimp: "owner/fanout", localId: 1, id: 41, kind: "wimp", src: "owner/child"},
    })
    const result = await applyIncrementalMatrixProjection(change)

    expect(change.affectedAtomIds).toEqual([17, 18])
    expect(change.invalidatedProcessWimps).toEqual(["owner/fanout"])
    expect(result.stats.touchedBranes).toBe(2)
    expect(result.stats.reusedBranes).toBe(2)
    expect(result.invalidatedAtomIds).toEqual([17, 18])
    expect(result.processCandidateBraneIndexes).toEqual([firstIndex, secondIndex])
    expect(matrix$.branes[firstIndex]).toBe(first)
    expect(matrix$.branes[secondIndex]).toBe(second)
    expect(matrix$.branes[peerIndex]).toBe(peer)
    expect(peer.lock).toBe(true)
  })

  test("keeps CPU and WebGPU structural traces identical without replacing either runtime", async () => {
    const run = async (backend: "cpu" | "gpu"): Promise<{birth: number[][]; added: number[][]; evolved: number[][]}> => {
      if (backend === "gpu") await installTestGpuDevice()
      Bun.env.METAFOR_WEAK_BACKEND = backend
      await prepareIncrementalMatrixFixture(statefulProjection())
      const runtime = weak$.runtime
      const birth = await weakRunStep(StepMode.UndefinedOnly)
      const result = await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(addStatefulAtom()))
      weakStructuralUpdate(result.weakUpdate)
      const added = await weakRunStep(StepMode.UndefinedOnly)
      const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(`${11}\0${101}`)!
      matrix$.branes[1]!.lock = false
      matrix$.getField(1, fieldIndex)!.value = 12
      weakHeapUpdate([
        {kind: "lock", braneIndex: 1, value: false},
        {kind: "field", braneIndex: 1, fieldIndex},
      ])
      expect(matrix$.getFieldValue(1, fieldIndex)).toBe(12)
      const idle = matrix$.getState(1, 0)!
      const transition = matrix$.transitions[idle.transitionOffset]!
      const condition = matrix$.conditions[transition.conditionOffset]!
      expect({target: transition.targetState, fieldIndex: condition.fieldIndex, op: condition.op, value: condition.value})
        .toEqual({target: 1, fieldIndex, op: 2, value: 10})
      const evolved = await weakRunStep(StepMode.Full)
      expect(weak$.runtime).toBe(runtime)
      weak$.dispose()
      return {birth, added, evolved}
    }

    const cpu = await run("cpu")
    const gpu = await run("gpu")
    expect(gpu).toEqual(cpu)
    expect(cpu).toEqual({birth: [[0, 0]], added: [[1, 0]], evolved: [[1, 1]]})
  })

  test("compacts WebGPU structural heap churn without replacing runtime or pipeline", async () => {
    await installTestGpuDevice()
    Bun.env.METAFOR_WEAK_BACKEND = "gpu"
    await prepareIncrementalMatrixFixture(largeProjection(1))
    const runtime = weak$.runtime
    const internal = runtime as unknown as {
      context: {deadHeapWords: number; heapWords: number; pipeline: GPUComputePipeline}
    }
    const pipeline = internal.context.pipeline

    for (let value = 1; value <= 220; value++) {
      const result = await applyIncrementalMatrixProjection(
        applyMatrixProjectionParticle(replaceAtom(1, 10_000, value)),
      )
      weakStructuralUpdate(result.weakUpdate)
    }
    await weakRunStep(StepMode.UndefinedOnly)

    expect(weak$.runtime).toBe(runtime)
    expect(internal.context.pipeline).toBe(pipeline)
    expect(internal.context.deadHeapWords).toBeLessThan(1024)
    expect(internal.context.heapWords).toBeLessThan(1024)
    const fieldIndex = strong$.runtimeFieldIndexByAtomFieldId.get(`${1}\0${101}`)!
    expect(matrix$.getFieldValue(0, fieldIndex)).toBe(220)
  })
})
