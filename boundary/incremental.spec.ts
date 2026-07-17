import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId, gravitonDeclarationPath, parseInflatonAddress} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/root"
const CHILD = "owner/child"
const PEER = "owner/peer"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

describe("Boundary incremental projection", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: ParticleInput) => await boundary.materialize({parts: [{ts: 1, ...particle}] as [Particle]})
  const inflaton = (op: "add" | "replace" | "remove" | "test", path: string, value?: unknown): Particle => ({
    part: "inflaton",
    op,
    path,
    ts: 1,
    ...(value === undefined ? {} : {value}),
  })

  const declareRoot = async (): Promise<number> => {
    await apply(inflaton("test", ROOT))
    await apply(inflaton("add", `${ROOT}/meta`, {name: "Root"}))
    return Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} AND parent_atom IS NULL
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
      ts: expect.any(Number),
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
      ts: expect.any(Number),
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
      SELECT id, wimp FROM atom ORDER BY id
    `
    const childId = Number(before.find((atom) => atom.wimp === CHILD)!.id)
    const peerId = Number(before.find((atom) => atom.wimp === PEER)!.id)
    const childObjectIds = boundary.projection.atomIdsByDeclaration.get(`${ROOT}/matter/1`)

    await apply(inflaton("replace", `${CHILD}/meta`, {name: "Renamed child"}))
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${CHILD}`)[0]!.id).toBe(childId)
    expect(boundary.projection.atomIdsByDeclaration.get(`${ROOT}/matter/1`)).toBe(childObjectIds)

    const removed = await apply(inflaton("remove", `${ROOT}/matter/1`))
    expect(removed?.messages).toContainEqual({parts: [{part: "graviton", op: "remove", path: `atom/${childId}`, ts: expect.any(Number)}]})
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM atom ORDER BY id`).toEqual([
      {id: rootId, wimp: ROOT},
      {id: peerId, wimp: PEER},
    ])
    expect(boundary.projection.childrenByParent.get(`atom/${rootId}`)).toEqual(new Set([`atom/${peerId}`]))
  })

	test("materializes child Fields from the parent's declared Matter binding", async () => {
		const rootId = await declareRoot()
		await apply(inflaton("add", `${ROOT}/fields/1`, {key: "operation", type: "string", default: "commit"}))
		await apply(inflaton("add", `${ROOT}/fields/2`, {key: "args", type: "string", default: "--dry-run"}))
		await apply(inflaton("add", `${CHILD}/meta`, {name: "Child"}))
		await apply(inflaton("add", `${CHILD}/fields/1`, {key: "operation", type: "string"}))
		await apply(inflaton("add", `${CHILD}/fields/2`, {key: "args", type: "string"}))
		await apply(inflaton("add", `${ROOT}/matter/1`, {
			parent: null,
			edgeSlot: "root",
			position: 0,
			kind: "wimp",
			src: CHILD,
			fieldsBinding: {data: ["operation", "args"], expr: "{operation: _[0], args: _[1]}"},
		}))

		const childId = Number((await boundary.projection.sql<Array<{id: number}>>`
			SELECT id FROM atom WHERE wimp = ${CHILD}
		`)[0]!.id)
		expect(rootId).toBeGreaterThan(0)
		expect(await boundary.projection.sql<Array<{value: string}>>`
			SELECT value_json AS value FROM boundary_atom_field WHERE atom = ${childId} ORDER BY field
		`).toEqual([{value: '"commit"'}, {value: '"--dry-run"'}])
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
    const peerId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`)[0]!.id)
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(2)

    const commit = await apply({part: "higgs", op: "replace", path: rootId, value: {fields: {[String(fieldId)]: ["one"]}}})

    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id).toBe(topologyId)
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(1)
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`)[0]!.id).toBe(peerId)
    expect(commit?.messages).toContainEqual({parts: [{
      part: "higgs", op: "replace", path: `topology/${topologyId}`, value: {fields: {[String(fieldId)]: ["one"]}},
      ts: expect.any(Number),
      from: expect.any(String),
    }]})
  })

  test("Photon reconciles only the selected State-driven Axion branch", async () => {
    const rootId = await declareRoot()
    await apply(inflaton("add", `${ROOT}/states/1`, {name: "ready", position: 0}))
    await apply(inflaton("add", `${CHILD}/meta`, {name: "Ready child"}))
    await apply(inflaton("add", `${PEER}/meta`, {name: "Fallback child"}))
    await apply(inflaton("add", `${ROOT}/matter/1`, {
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "axion",
      predicateBinding: {data: "/state", expr: "_[0] === 'ready'"},
    }))
    await apply(inflaton("add", `${ROOT}/matter/2`, {
      parent: "1", edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    }))
    await apply(inflaton("add", `${ROOT}/matter/3`, {
      parent: "1", edgeSlot: "else", position: 1, kind: "wimp", src: PEER,
    }))

    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE kind = ${"axion"}
    `)[0]!.id)
    const fallbackId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${PEER}
    `)[0]!.id)
    expect(await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${CHILD}`).toEqual([])

    const commit = await apply({part: "photon", op: "replace", path: rootId, value: "ready"})

    expect((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE kind = ${"axion"}
    `)[0]!.id).toBe(topologyId)
    expect(await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`).toEqual([])
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(1)
    expect(commit?.messages).toContainEqual({parts: [{part: "graviton", op: "remove", path: `atom/${fallbackId}`, ts: expect.any(Number)}]})
    expect(commit?.messages).toContainEqual({parts: [{
      part: "higgs", op: "replace", path: `topology/${topologyId}`, value: {state: "ready"},
      ts: expect.any(Number),
    }]})

    const readyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `)[0]!.id)
    expect(await apply({part: "photon", op: "replace", path: rootId, value: "ready"})).toBeNull()
    expect((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `)[0]!.id).toBe(readyId)
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
      ts: expect.any(Number),
      value: {
        id: boundaryEntityId(`${ROOT}/processes/1`),
        wimp: ROOT,
        state: "ready",
        descriptor: {
          type: "action",
          key: "ready",
          label: null,
          desc: null,
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
    expect(replay.some((message) => message.parts[0].path === `atom/${rootId}`)).toBe(true)
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
