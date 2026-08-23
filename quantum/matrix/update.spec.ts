import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import {weak$} from "@matrix/weak"
import {prepareMatrixBirthFixture} from "./tests/shared/fixtures.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

const initialState = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [{
    id: 17,
    wimp: "owner/update-order",
    values: [{field: 101, valueId: 1001, value: 0}],
    state: 201,
  }],
  declarations: [
    {
      src: "owner/update-order",
      section: "fields",
      localId: "1",
      value: {id: 101, key: "value", type: "number", default: 0, position: 0},
    },
    {
      src: "owner/update-order",
      section: "states",
      localId: "1",
      value: {id: 201, name: "idle", position: 0},
    },
    {
      src: "owner/update-order",
      section: "states",
      localId: "2",
      value: {id: 202, name: "ready", position: 1},
    },
    {
      src: "owner/update-order",
      section: "transitions",
      localId: "1",
      value: {id: 301, fromState: 201, toState: 202, position: 0},
    },
    {
      src: "owner/update-order",
      section: "conditions",
      localId: "1",
      value: {id: 401, transition: 301, field: 101, predicate: {gt: 50}, position: 0},
    },
  ],
})

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

describe("Matrix update order after cold birth", () => {
  test("serializes simultaneous Field changes without a full Store replacement", async () => {
    await prepareMatrixBirthFixture(initialState())
    const runtime = await import(`./matrix.ts?update-order=${crypto.randomUUID()}`)

    const first = runtime.update([[0, [[0, 100]]]])
    const second = runtime.update([[0, [[0, 200]]]])
    const [firstChanges, secondChanges] = await Promise.all([first, second])

    expect(firstChanges).toEqual([[0, 1]])
    expect(secondChanges).toEqual([])
    expect(runtime.matrix$.states).toEqual([1])
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(200)
    await expect(runtime.update([[99, []]])).rejects.toThrow("Brane index out of range")
  })

  test("keeps a locked Atom in its State while retaining Field changes", async () => {
    await prepareMatrixBirthFixture(initialState())
    const runtime = await import(`./matrix.ts?locked-update=${crypto.randomUUID()}`)

    expect(await runtime.update([[0, [[0, 100]], true]])).toEqual([])
    expect(await runtime.update([[0, [[0, 200]]]])).toEqual([])
    expect(runtime.matrix$.states).toEqual([0])
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(200)

    expect(await runtime.update([[0, [], false]])).toEqual([[0, 1]])
    expect(runtime.matrix$.states).toEqual([1])
  })
})
