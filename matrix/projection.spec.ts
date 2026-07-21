import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import type {Particle} from "shared/protocol/force/particle"
import {weak$} from "@matrix/weak"
import {strong$} from "@matrix/strong"
import {matrix$} from "./store.ts"
import {consumePreparedMatrixBirth, prepareMatrixBirth, reprepareMatrixRuntime} from "./birth.ts"
import {applyMatrixProjectionParticle} from "./projection.ts"

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

describe("Matrix live structural Field projection", () => {
  test("rebuilds packed shared layout direct to computed and back", async () => {
    await prepareMatrixBirth(initialState())
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))

    expect(applyMatrixProjectionParticle(childGraviton(9100, "first.png"))).toEqual({structural: true})
    await reprepareMatrixRuntime()
    expect(matrix$.sharedBlocks).toHaveLength(0)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .not.toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
    expect(matrix$.getFieldLocation(0, strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101))!)?.scope).toBe("local")
    expect(matrix$.getFieldLocation(1, strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201))!)?.scope).toBe("local")

    expect(applyMatrixProjectionParticle(childGraviton(9001, "first.png", 101))).toEqual({structural: true})
    await reprepareMatrixRuntime()
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 101)))
      .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
    expect(consumePreparedMatrixBirth()).toBe(true)
  })

  test("moves the child from one parent Field shared block to another", async () => {
    await prepareMatrixBirth(initialState())

    expect(applyMatrixProjectionParticle(childGraviton(9002, "second.png", 102))).toEqual({structural: true})
    await reprepareMatrixRuntime()

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

  test("re-prepares the live shared layout on the strict GPU backend", async () => {
    Bun.env.METAFOR_WEAK_BACKEND = "gpu"
    try {
      await prepareMatrixBirth(initialState())
      expect(weak$.mode).toBe("gpu")
      expect(matrix$.sharedBlocks).toHaveLength(1)

      applyMatrixProjectionParticle(childGraviton(9100, "first.png"))
      await reprepareMatrixRuntime()
      expect(weak$.mode).toBe("gpu")
      expect(matrix$.sharedBlocks).toHaveLength(0)

      applyMatrixProjectionParticle(childGraviton(9002, "second.png", 102))
      await reprepareMatrixRuntime()
      expect(weak$.mode).toBe("gpu")
      expect(matrix$.sharedBlocks).toHaveLength(1)
      expect(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(17, 102)))
        .toBe(strong$.runtimeFieldIndexByAtomFieldId.get(atomKey(18, 201)))
      expect(consumePreparedMatrixBirth()).toBe(true)
    } finally {
      Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    }
  })
})
