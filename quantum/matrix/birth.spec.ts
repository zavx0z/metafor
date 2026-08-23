import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import {STATE_UNDEFINED} from "@metafor/types/matrix/runtime"
import {gravity$} from "gravity/store.ts"
import {strong$} from "strong"
import {weak$} from "weak"
import {buildMatrixRuntime, consumePreparedMatrixBirth} from "./birth.ts"
import {matrix$} from "./store.ts"
import {prepareMatrixBirthFixture} from "./tests/shared/fixtures.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

const initialState = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [],
  atoms: [{id: 17, wimp: "owner/runtime", values: [{field: 101, valueId: 1001, value: 0}], state: null}],
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

describe("Matrix Oracle birth", () => {
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
    expect(runtime.runtime.restartProcessAtomIds).toEqual([])
  })

  test("marks only a matching prior pending Process for cold replacement", () => {
    const pending = initialState()
    pending.atoms[0]!.state = 202
    pending.pendingProcessExecutions = [{
      executionId: "execution-before-cold-birth",
      atom: 17,
      process: 501,
      state: "ready",
    }]
    expect(buildMatrixRuntime(pending).runtime.restartProcessAtomIds).toEqual([17])

    pending.pendingProcessExecutions = []
    expect(buildMatrixRuntime(pending).runtime.restartProcessAtomIds).toEqual([])
  })

  test("prepares the permanent Store and Weak before runtime birth", async () => {
    await expect(prepareMatrixBirthFixture(initialState())).resolves.toEqual({atoms: 1, fields: 1, backend: "cpu"})

    expect(weak$.initialized).toBe(true)
    expect(matrix$.fields).toEqual([{type: 0}])
    expect(gravity$.activeAtomIds).toEqual([17])
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(["17", "101"].join("\0"))).toBe(0)
    expect(consumePreparedMatrixBirth()).toBe(true)
    expect(consumePreparedMatrixBirth()).toBe(false)
  })

  test("prepares persisted optional Boundary values before Matrix opens Force", async () => {
    const optional: BoundaryInitialState = {
      version: 1,
      pendingProcessExecutions: [],
      atoms: [{
        id: 18,
        wimp: "owner/optional",
        state: null,
        values: [101, 102, 103, 104, 105].map((field) => ({field, valueId: 1000 + field, value: null})),
      }],
      declarations: [
        {src: "owner/optional", section: "fields", localId: "1", value: {id: 101, key: "text", type: "string", required: false, position: 0}},
        {src: "owner/optional", section: "fields", localId: "2", value: {id: 102, key: "count", type: "number", required: false, position: 1}},
        {src: "owner/optional", section: "fields", localId: "3", value: {id: 103, key: "enabled", type: "boolean", required: false, position: 2}},
        {src: "owner/optional", section: "fields", localId: "4", value: {id: 104, key: "items", type: "array", required: false, position: 3}},
        {src: "owner/optional", section: "fields", localId: "5", value: {id: 105, key: "mode", type: "enum", required: false, position: 4}},
        {src: "owner/optional", section: "variants", localId: "1", value: {id: 201, field: 105, itemValue: "idle", position: 0}},
      ],
    }

    await expect(prepareMatrixBirthFixture(optional)).resolves.toEqual({atoms: 1, fields: 5, backend: "cpu"})
    expect(matrix$.braneValues.map((record) => record.value)).toEqual([null, null, null, null, null])
    expect(consumePreparedMatrixBirth()).toBe(true)
  })

  test("restores canonical Field entanglement from shared Boundary value identity", async () => {
    const entangled: BoundaryInitialState = {
      version: 1,
      pendingProcessExecutions: [],
      atoms: [
        {id: 17, wimp: "owner/parent", values: [{field: 101, valueId: 9001, value: "shot.png"}], state: null},
        {id: 18, wimp: "owner/child", values: [{field: 201, valueId: 9001, value: "shot.png"}], state: null},
      ],
      declarations: [
        {src: "owner/parent", section: "fields", localId: "1", value: {id: 101, key: "screenshotPath", type: "string", position: 0}},
        {src: "owner/child", section: "fields", localId: "1", value: {id: 201, key: "path", type: "string", position: 0}},
      ],
    }

    const runtime = buildMatrixRuntime(entangled)
    expect(runtime.data.fields).toEqual([{type: 3}])
    expect(runtime.data.branes.map((brane) => brane.values)).toEqual([[[0, "shot.png"]], [[0, "shot.png"]]])
    expect(runtime.data.entanglement).toEqual({
      blocks: [{
        key: "value:9001",
        braneIndices: [0, 1],
        fields: [{
          fieldIndex: 0,
          fieldName: "screenshotPath",
          payloadIds: ["atom:17/field:101", "atom:18/field:201"],
          semanticKeys: ["owner/child:path", "owner/parent:screenshotPath"],
          representativeBraneIndex: 0,
        }],
      }],
    })

    await prepareMatrixBirthFixture(entangled)
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(matrix$.braneValues).toEqual([])
    expect(matrix$.getFieldLocation(0, 0)?.record).toBe(matrix$.getFieldLocation(1, 0)?.record)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(["17", "101"].join("\0"))).toBe(0)
    expect(strong$.runtimeFieldIndexByAtomFieldId.get(["18", "201"].join("\0"))).toBe(0)
    expect(consumePreparedMatrixBirth()).toBe(true)
  })
})
