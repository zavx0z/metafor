import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import type {Particle} from "shared/protocol/force/particle"
import {StepMode, weak$, weakRunStep, weakStructuralUpdate} from "weak"
import {strong$} from "strong"
import {gravity$} from "gravity/store.ts"
import {matrix$} from "./store.ts"
import {installTestGpuDevice} from "./weak/tests/shared/gpu.ts"
import {consumePreparedMatrixBirth} from "./birth.ts"
import {applyIncrementalMatrixProjection} from "./incremental.ts"
import {applyMatrixProjectionParticle} from "./projection.ts"
import {prepareIncrementalMatrixFixture} from "./tests/shared/fixtures.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const atomKey = (atom: number, field: number): string => `${atom}\0${field}`

const initialState = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [
    {
      id: 17,
      wimp: "owner/parent",
      values: [
        {field: 101, valueId: 9001, value: "first.png"},
        {field: 102, valueId: 9002, value: "second.png"},
      ],
      state: null,
    },
    {
      id: 18,
      wimp: "owner/child",
      values: [{field: 201, valueId: 9001, value: "first.png"}],
      state: null,
    },
  ],
  declarations: [
    {src: "owner/parent", section: "fields", localId: "1", value: {id: 101, key: "first", type: "string", position: 0}},
    {src: "owner/parent", section: "fields", localId: "2", value: {id: 102, key: "second", type: "string", position: 1}},
    {src: "owner/child", section: "fields", localId: "1", value: {id: 201, key: "path", type: "string", position: 0}},
  ],
})

const childGraviton = (
  valueId: number,
  value: string,
  parentField?: number,
): Particle => ({
  part: "graviton",
  op: "replace",
  path: "atom/18",
  by: "boundary",
  ts: 2,
  value: {
    atom: {id: 18, parentAtom: 17, parentTopology: null, wimp: "owner/child", position: 0},
    values: [{atom: 18, field: 201, value: valueId}],
    valueRecords: [{id: valueId, kind: "string", text: value}],
    valueItems: [],
    ...(parentField === undefined ? {} : {
      fieldSources: [{childAtom: 18, childField: 201, parentAtom: 17, parentField}],
    }),
    state: {atom: 18, metaState: null},
  },
})

const addChild = (atomId: number, valueId: number, value: string): Particle => ({
  part: "graviton",
  op: "add",
  path: `atom/${atomId}`,
  by: "boundary",
  ts: 3,
  value: {
    atom: {id: atomId, parentAtom: null, parentTopology: null, wimp: "owner/child", position: 0},
    values: [{atom: atomId, field: 201, value: valueId}],
    valueRecords: [{id: valueId, kind: "string", text: value}],
    valueItems: [],
    state: {atom: atomId, metaState: null},
  },
})

describe("Matrix live structural Field projection", () => {
  test("patches packed shared layout direct to computed and back", async () => {
    await prepareIncrementalMatrixFixture(initialState())
    const parentBrane = matrix$.branes[0]
    const runtime = weak$.runtime
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))

    const computed = applyMatrixProjectionParticle(childGraviton(9100, "first.png"))
    expect(computed).toMatchObject({structural: true})
    const computedResult = await applyIncrementalMatrixProjection(computed)
    expect(matrix$.sharedBlocks).toHaveLength(0)
    expect(matrix$.branes[0]).toBe(parentBrane)
    expect(weak$.runtime).toBe(runtime)
    expect(computedResult.stats).toMatchObject({projectionAtoms: 2, touchedBranes: 2, reusedBranes: 2})
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .not.toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
    expect(matrix$.getFieldLocation(0, strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101))!)?.scope).toBe("local")
    expect(matrix$.getFieldLocation(1, strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201))!)?.scope).toBe("local")

    const direct = applyMatrixProjectionParticle(childGraviton(9001, "first.png", 101))
    expect(direct).toMatchObject({structural: true})
    await applyIncrementalMatrixProjection(direct)
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
    expect(consumePreparedMatrixBirth()).toBe(true)
  })

  test("moves the child from one parent Field shared block to another", async () => {
    await prepareIncrementalMatrixFixture(initialState())

    const moved = applyMatrixProjectionParticle(childGraviton(9002, "second.png", 102))
    expect(moved).toMatchObject({structural: true})
    await applyIncrementalMatrixProjection(moved)

    const first = strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101))
    const second = strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 102))
    const child = strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201))
    expect(first).not.toBe(child)
    expect(second).toBe(child)
    expect(matrix$.sharedBlocks).toHaveLength(1)
    const encoded = matrix$.getFieldValue(1, child!)
    expect(matrix$.stringTable[Number(encoded)]).toBe("second.png")
    expect(consumePreparedMatrixBirth()).toBe(true)
  })

  test("removes and adds Atom through a free slot without shifting an unaffected brane", async () => {
    await prepareIncrementalMatrixFixture(initialState())
    const childBrane = matrix$.branes[1]
    const runtime = weak$.runtime

    const removed = applyMatrixProjectionParticle({
      part: "graviton",
      op: "remove",
      path: "atom/17",
      by: "boundary",
      ts: 2,
    })
    const removal = await applyIncrementalMatrixProjection(removed)
    weakStructuralUpdate(removal.weakUpdate)
    await weakRunStep(StepMode.UndefinedOnly)

    expect(gravity$.getBraneIndexByAtomId(18)).toBe(1)
    expect(matrix$.branes[1]).toBe(childBrane)
    expect(matrix$.sharedBlocks).toHaveLength(0)

    const addition = await applyIncrementalMatrixProjection(
      applyMatrixProjectionParticle(addChild(19, 9200, "third.png")),
    )
    weakStructuralUpdate(addition.weakUpdate)
    await weakRunStep(StepMode.UndefinedOnly)

    expect(gravity$.getBraneIndexByAtomId(18)).toBe(1)
    expect(gravity$.getBraneIndexByAtomId(19)).toBe(0)
    expect(matrix$.branes).toHaveLength(2)
    expect(weak$.runtime).toBe(runtime)
  })

  test("patches the live shared layout on the strict GPU backend", async () => {
    await installTestGpuDevice()
    Bun.env.METAFOR_WEAK_BACKEND = "gpu"
    try {
      await prepareIncrementalMatrixFixture(initialState())
      expect(weak$.mode).toBe("gpu")
      expect(matrix$.sharedBlocks).toHaveLength(1)

      const runtime = weak$.runtime
      const computed = await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(childGraviton(9100, "first.png")))
      weakStructuralUpdate(computed.weakUpdate)
      await weakRunStep(StepMode.UndefinedOnly)
      expect(weak$.mode).toBe("gpu")
      expect(weak$.runtime).toBe(runtime)
      expect(matrix$.sharedBlocks).toHaveLength(0)

      const direct = await applyIncrementalMatrixProjection(applyMatrixProjectionParticle(childGraviton(9002, "second.png", 102)))
      weakStructuralUpdate(direct.weakUpdate)
      await weakRunStep(StepMode.UndefinedOnly)
      expect(weak$.mode).toBe("gpu")
      expect(weak$.runtime).toBe(runtime)
      expect(matrix$.sharedBlocks).toHaveLength(1)
      expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 102)))
        .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
      expect(consumePreparedMatrixBirth()).toBe(true)
    } finally {
      Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    }
  })
})
