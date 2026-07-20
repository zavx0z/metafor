import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import {STATE_UNDEFINED} from "@metafor/types/matrix/runtime"
import {gravity$} from "@matrix/gravity/store.ts"
import {strong$} from "@matrix/strong"
import {weak$} from "@matrix/weak"
import {buildMatrixRuntime, consumePreparedMatrixBirth, prepareMatrixBirth} from "./birth.ts"
import {matrix$} from "./store.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

const initialState = (): BoundaryInitialState => ({
  version: 1,
  atoms: [{id: 17, wimp: "owner/runtime", values: [{field: 101, value: 0}], state: null}],
  declarations: [
    {src: "owner/runtime", section: "fields", localId: "1", value: {id: 101, key: "input", type: "number", default: 0, position: 0}},
    {src: "owner/runtime", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
    {src: "owner/runtime", section: "states", localId: "2", value: {id: 202, name: "ready", position: 1}},
    {src: "owner/runtime", section: "transitions", localId: "1", value: {id: 301, fromState: 201, toState: 202, position: 0}},
    {src: "owner/runtime", section: "conditions", localId: "1", value: {id: 401, transition: 301, field: 101, position: 0, predicate: {eq: 1}}},
    {src: "owner/runtime", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
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

describe("Matrix Monad birth", () => {
  test("owns the canonical Boundary to packed Matrix conversion", () => {
    const runtime = buildMatrixRuntime(initialState())

    expect(runtime.runtime.atomIdByBraneIndex).toEqual([17])
    expect(runtime.runtime.runtimeFieldIndexByAtomFieldId).toEqual([[17, 101, 0]])
    expect(runtime.data.fields).toEqual([{type: 0}])
    expect(runtime.data.branes).toEqual([{
      values: [[0, 0]],
      state: STATE_UNDEFINED,
      collapses: [[[1, {0: {eq: 1}}]], []],
    }])
    expect(runtime.data.stateNames).toEqual([["idle", "ready"]])
    expect(runtime.weak.stateHasProcessByBraneIndex).toEqual([[false, true]])
  })

  test("prepares the permanent Store and Weak before runtime birth", async () => {
    await expect(prepareMatrixBirth(initialState())).resolves.toEqual({atoms: 1, fields: 1, backend: "cpu"})

    expect(weak$.initialized).toBe(true)
    expect(matrix$.fields).toEqual([{type: 0}])
    expect(gravity$.activeAtomIds).toEqual([17])
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(["17", "101"].join("\0"))).toBe(0)
    expect(consumePreparedMatrixBirth()).toBe(true)
    expect(consumePreparedMatrixBirth()).toBe(false)
  })
})
