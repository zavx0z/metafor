import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {DeclarationPath} from "shared/protocol/force/declaration"
import {open, type BoundaryDatabase} from "./quantum/boundary/sqlite.ts"
import {
  buildMatrixRuntime,
  consumePreparedMatrixBirth,
} from "./quantum/matrix/birth.ts"
import {applyIncrementalMatrixProjection} from "./quantum/matrix/incremental.ts"
import {applyMatrixProjectionParticle} from "./quantum/matrix/projection.ts"
import {matrix$} from "./quantum/matrix/store.ts"
import {prepareIncrementalMatrixFixture} from "./quantum/matrix/tests/shared/fixtures.ts"
import {weak$} from "./quantum/matrix/weak/index.ts"

const PARENT = "zavx0z/capsule"
const CHILD = "zavx0z/capsule/screenshot"
const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

describe("Field entanglement cold start", () => {
  let boundary: BoundaryDatabase | undefined
  let directory: string | undefined

  afterEach(async () => {
    weak$.dispose()
    await boundary?.close()
    boundary = undefined
    if (directory) await rm(directory, {recursive: true, force: true})
    directory = undefined
    if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
    else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
  })

  test("restores the persisted source relation as one shared Matrix value without a new Graviton", async () => {
    Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    directory = await mkdtemp(join(tmpdir(), "metafor-field-entanglement-"))
    const filename = join(directory, "boundary.sqlite")
    boundary = await open(filename)
    const apply = async (path: DeclarationPath, value: Record<string, unknown>) => {
      await boundary!.materialize({parts: [{part: "inflaton", op: "add", path, value, by: "dark", ts: 1}]})
    }

    await apply("wimp", {src: PARENT, name: "Capsule"})
    await apply("field", {wimp: PARENT, id: 1, key: "screenshotPath", type: "string", default: "shot.png"})
    await apply("matter", {
      wimp: PARENT,
      id: 1,
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: CHILD,
      fieldsBinding: {data: "screenshotPath", expr: "{path: _[0]}"},
    })
    await apply("wimp", {src: CHILD, name: "Screenshot"})
    await apply("field", {wimp: CHILD, id: 1, key: "path", type: "string"})

    await boundary.close()
    boundary = await open(filename)

    const initial = await boundary.initialState()
    expect(initial.atoms).toHaveLength(2)
    expect(new Set(initial.atoms.flatMap((atom) => atom.values.map((value) => value.valueId))).size).toBe(1)
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom_field_source
    `).toEqual([{count: 1}])

    const runtime = buildMatrixRuntime(initial)
    expect(runtime.data.fields).toEqual([{type: 3}])
    expect(runtime.data.entanglement?.blocks).toHaveLength(1)
    expect(runtime.data.branes.map((brane) => brane.values)).toEqual([
      [[0, "shot.png"]],
      [[0, "shot.png"]],
    ])
    expect(runtime.runtime.runtimeFieldIndexByAtomFieldId.map((entry) => entry[2])).toEqual([0, 0])

    await prepareIncrementalMatrixFixture(initial)
    expect(matrix$.sharedBlocks).toHaveLength(1)

    const computed = await boundary.materialize({parts: [{
      part: "inflaton",
      op: "replace",
      path: "matter",
      by: "dark",
      ts: 2,
      value: {
        wimp: PARENT,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "wimp",
        src: CHILD,
        fieldsBinding: {data: "screenshotPath", expr: '{path: _[0] + ""}'},
      },
    }]})
    const computedAtom = computed?.messages.find((message) =>
      message.parts[0].part === "graviton" && /^atom\/\d+$/.test(String(message.parts[0].path)),
    )?.parts[0]
    expect(computedAtom).toBeDefined()
    const computedChange = applyMatrixProjectionParticle(computedAtom!)
    expect(computedChange).toMatchObject({structural: true})
    await applyIncrementalMatrixProjection(computedChange)
    expect(matrix$.sharedBlocks).toHaveLength(0)

    const direct = await boundary.materialize({parts: [{
      part: "inflaton",
      op: "replace",
      path: "matter",
      by: "dark",
      ts: 3,
      value: {
        wimp: PARENT,
        id: 1,
        parent: null,
        edgeSlot: "root",
        position: 0,
        kind: "wimp",
        src: CHILD,
        fieldsBinding: {data: "screenshotPath", expr: "{path: _[0]}"},
      },
    }]})
    const directAtom = direct?.messages.find((message) =>
      message.parts[0].part === "graviton" && /^atom\/\d+$/.test(String(message.parts[0].path)),
    )?.parts[0]
    expect(directAtom).toBeDefined()
    const directChange = applyMatrixProjectionParticle(directAtom!)
    expect(directChange).toMatchObject({structural: true})
    await applyIncrementalMatrixProjection(directChange)
    expect(matrix$.sharedBlocks).toHaveLength(1)
    expect(consumePreparedMatrixBirth()).toBe(true)
  })
})
