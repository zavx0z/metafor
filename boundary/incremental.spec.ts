import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId, gravitonDeclarationPath, parseInflatonAddress} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/root"
const CHILD = "owner/child"
const PEER = "owner/peer"

describe("Boundary incremental projection", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: Particle) => await boundary.materialize({parts: [particle]})
  const inflaton = (op: "add" | "replace" | "remove" | "test", path: string, value?: unknown): Particle => ({
    part: "inflaton",
    op,
    path,
    ...(value === undefined ? {} : {value}),
  })

  const declareRoot = async (): Promise<number> => {
    await apply(inflaton("test", ROOT))
    await apply(inflaton("add", `${ROOT}/meta`, {name: "Root"}))
    return Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE wimp = ${ROOT} AND parent_actor IS NULL
    `)[0]!.id)
  }

  test("parses slash-bearing WIMP sources and omits singleton local zero", () => {
    const field = parseInflatonAddress("owner/project/fields/17")
    expect(field).toEqual({src: "owner/project", section: "fields", localId: "17", path: "owner/project/fields/17"})
    expect(gravitonDeclarationPath(field!)).toBe("declaration/owner/project/fields/17")
    expect(gravitonDeclarationPath(parseInflatonAddress("owner/project/meta")!)).toBe("declaration/owner/project/meta")
  })

  test("applies one entity transaction and emits a canonical minimal replace", async () => {
    await declareRoot()
    const path = `${ROOT}/fields/1`
    const added = await apply(inflaton("add", path, {key: "title", type: "string", required: false, label: "Before"}))
    const replaced = await apply(inflaton("replace", path, {label: "After"}))

    expect(added?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "add",
      path: `declaration/${path}`,
      value: {
        id: boundaryEntityId(path),
        wimp: ROOT,
        localId: 1,
        key: "title",
        type: "string",
        required: false,
        label: "Before",
      },
    }]})
    expect(replaced?.messages).toEqual([{parts: [{
      part: "graviton",
      op: "replace",
      path: `declaration/${path}`,
      value: {label: "After"},
    }]}])
    expect(boundary.projection.declarations.get(path)).toEqual({
      key: "title", type: "string", required: false, label: "After",
    })
  })

  test("removing one child branch preserves root, sibling and their identities", async () => {
    const rootId = await declareRoot()
    await apply(inflaton("add", `${CHILD}/meta`, {name: "Child"}))
    await apply(inflaton("add", `${PEER}/meta`, {name: "Peer"}))
    await apply(inflaton("add", `${ROOT}/matter/1`, {parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD}))
    await apply(inflaton("add", `${ROOT}/matter/2`, {parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: PEER}))

    const before = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM actor ORDER BY id
    `
    const childId = Number(before.find((actor) => actor.wimp === CHILD)!.id)
    const peerId = Number(before.find((actor) => actor.wimp === PEER)!.id)
    const childObjectIds = boundary.projection.actorIdsByDeclaration.get(`${ROOT}/matter/1`)

    await apply(inflaton("replace", `${CHILD}/meta`, {name: "Renamed child"}))
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${CHILD}`)[0]!.id).toBe(childId)
    expect(boundary.projection.actorIdsByDeclaration.get(`${ROOT}/matter/1`)).toBe(childObjectIds)

    const removed = await apply(inflaton("remove", `${ROOT}/matter/1`))
    expect(removed?.messages).toContainEqual({parts: [{part: "graviton", op: "remove", path: `actor/${childId}`}]})
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM actor ORDER BY id`).toEqual([
      {id: rootId, wimp: ROOT},
      {id: peerId, wimp: PEER},
    ])
    expect(boundary.projection.childrenByParent.get(`actor/${rootId}`)).toEqual(new Set([`actor/${peerId}`]))
  })

  test("Macho materializes multiplicity locally and Higgs rebuilds only its children", async () => {
    const rootId = await declareRoot()
    const fieldPath = `${ROOT}/fields/1`
    const fieldId = boundaryEntityId(fieldPath)
    await apply(inflaton("add", fieldPath, {key: "items", type: "array", required: true, default: ["a", "b"]}))
    await apply(inflaton("add", `${CHILD}/meta`, {name: "Child"}))
    await apply(inflaton("add", `${PEER}/meta`, {name: "Peer"}))
    await apply(inflaton("add", `${ROOT}/matter/1`, {
      parent: null, edgeSlot: "root", position: 0, kind: "macho", collectionBinding: {data: "items"},
    }))
    await apply(inflaton("add", `${ROOT}/matter/2`, {
      parent: "1", edgeSlot: "child", position: 0, kind: "wimp", src: CHILD,
    }))
    await apply(inflaton("add", `${ROOT}/matter/3`, {
      parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: PEER,
    }))

    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id)
    const peerId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${PEER}`)[0]!.id)
    expect((await boundary.projection.sql`SELECT id FROM actor WHERE wimp = ${CHILD}`).length).toBe(2)

    const commit = await apply({part: "higgs", op: "replace", path: rootId, value: {fields: {[String(fieldId)]: ["one"]}}})

    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id).toBe(topologyId)
    expect((await boundary.projection.sql`SELECT id FROM actor WHERE wimp = ${CHILD}`).length).toBe(1)
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${PEER}`)[0]!.id).toBe(peerId)
    expect(commit?.messages).toContainEqual({parts: [{
      part: "higgs", op: "replace", path: `topology/${topologyId}`, value: {fields: {[String(fieldId)]: ["one"]}},
    }]})
  })

  test("canonical process particle resolves field identities for Energy", async () => {
    await declareRoot()
    const fieldPath = `${ROOT}/fields/1`
    await apply(inflaton("add", fieldPath, {key: "command", type: "string"}))
    const commit = await apply(inflaton("add", `${ROOT}/processes/1`, {
      key: "ready",
      type: "action",
      env: ["server"],
      action: {src: "./run.ts", importSpecifier: "run", read: ["1"]},
      success: {src: "({update}) => update({})", read: ["1"], write: ["1"]},
      error: null,
    }))

    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "add",
      path: `declaration/${ROOT}/processes/1`,
      value: {
        id: boundaryEntityId(`${ROOT}/processes/1`),
        wimp: ROOT,
        state: "ready",
        descriptor: {
          type: "action",
          key: "ready",
          env: ["server"],
          action: {
            src: "./run.ts",
            importSpecifier: "run",
            readFields: [[boundaryEntityId(fieldPath), "command"]],
          },
          success: {
            src: "({update}) => update({})",
            readFields: [[boundaryEntityId(fieldPath), "command"]],
            writeFields: [[boundaryEntityId(fieldPath), "command"]],
          },
        },
      },
    }]})
  })

  test("replay is an ordinary idempotent one-entity add stream", async () => {
    const rootId = await declareRoot()
    await apply(inflaton("add", `${ROOT}/fields/1`, {key: "title", type: "string", default: "hello"}))
    const replay = await boundary.replay()

    expect(replay.length).toBeGreaterThan(2)
    expect(replay.every((message) => message.parts.length === 1)).toBe(true)
    expect(replay.some((message) => message.parts[0].path === `actor/${rootId}`)).toBe(true)
    expect(replay.some((message) => "type" in message || "snapshot" in message)).toBe(false)
  })

  test("failed entity transaction does not alter canonical projection", async () => {
    await declareRoot()
    const path = `${ROOT}/fields/1`
    await expect(apply(inflaton("add", path, {key: "broken", type: "object"}))).rejects.toThrow()
    expect(boundary.projection.declarations.has(path)).toBe(false)
    expect((await boundary.projection.sql`SELECT path FROM boundary_declaration_entity WHERE path = ${path}`).length).toBe(0)
  })
})
