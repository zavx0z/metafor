import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "shared/protocol/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/runtime"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

const deferred = (): {promise: Promise<void>; resolve(): void} => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return {promise, resolve}
}

const keyOf = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "key" in value && typeof value.key === "string"
    ? value.key
    : undefined

describe("Boundary canonical initial state", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: ParticleInput): Promise<void> => {
    await boundary.materialize({parts: [{ts: 1, ...particle}] as [Particle]})
  }

  const declaration = async (path: "field" | "variant" | "state" | "transition" | "condition" | "process", localId: number, value: Record<string, unknown>): Promise<void> => {
    await apply({
      part: "inflaton",
      op: "add",
      path,
      value: {wimp: ROOT, id: localId, ...value},
    })
  }

  test("returns normalized source rows without preparing a Matrix Store", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})
    await declaration("field", 1, {key: "input", type: "number", default: 0, position: 0})
    await declaration("state", 1, {name: "idle", position: 0})
    await declaration("state", 2, {name: "ready", position: 1})
    await declaration("transition", 1, {from: 1, to: 2, position: 0})
    await declaration("condition", 1, {transition: 1, field: 1, position: 0, predicate: {eq: 1}})
    await declaration("process", 1, {
      key: "ready",
      type: "action",
      env: ["server"],
      action: {src: "./run.ts", read: [1]},
    })

    const initial = await boundary.initialState()
    const atomId = initial.atoms[0]!.id
    const fieldId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
    const valueId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT value AS id FROM atom_value WHERE atom = ${atomId} AND field = ${fieldId}
    `)[0]!.id)

    expect(initial.version).toBe(1)
    expect(initial.atoms).toEqual([{
      id: atomId,
      wimp: ROOT,
      values: [{field: fieldId, valueId, value: 0}],
      state: null,
    }])
    expect(initial.declarations.find((item) => item.section === "fields")?.value).toMatchObject({
      id: fieldId,
      wimp: ROOT,
      key: "input",
      type: "number",
      default: 0,
    })
    expect(initial.declarations.filter((item) => item.section === "states").map((item) => item.value.name)).toEqual([
      "idle",
      "ready",
    ])
    expect(initial.declarations.find((item) => item.section === "conditions")?.value.predicate).toEqual({eq: 1})
    expect(initial.declarations.find((item) => item.section === "processes")?.value.state).toBe("ready")

    const atomCount = (await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom
    `)[0]!.count
    const declarationCount = (await boundary.projection.sql<Array<{count: number}>>`
      SELECT
        (SELECT COUNT(*) FROM wimp) +
        (SELECT COUNT(*) FROM field) +
        (SELECT COUNT(*) FROM state) +
        (SELECT COUNT(*) FROM transition) +
        (SELECT COUNT(*) FROM condition) +
        (SELECT COUNT(*) FROM process) AS count
    `)[0]!.count
    expect(Number(atomCount)).toBe(1)
    expect(Number(declarationCount)).toBe(7)
  })

  test("returns the complete current projection as timestamp-free service data", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})
    await declaration("field", 1, {key: "input", type: "number", default: 0, position: 0})

    const initial = await boundary.initialProjection()

    expect(initial.version).toBe(1)
    expect(initial.entries.some((entry) => entry.path === "wimp")).toBe(true)
    expect(initial.entries.some((entry) => entry.path === "field")).toBe(true)
    expect(initial.entries.some((entry) => typeof entry.path === "string" && entry.path.startsWith("atom/"))).toBe(true)
    expect(initial.entries.every((entry) => !("ts" in entry) && !("by" in entry))).toBe(true)
  })

  test("serializes every initial read between adjacent materializations", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})

    const firstApplied = deferred()
    const releaseFirst = deferred()
    const secondApplied = deferred()
    const releaseSecond = deferred()
    const originalApply = boundary.projection.apply.bind(boundary.projection)
    let applyCount = 0
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined

    boundary.projection.apply = async (message) => {
      const result = await originalApply(message)
      applyCount += 1
      if (applyCount === 1) {
        firstApplied.resolve()
        await releaseFirst.promise
      } else if (applyCount === 2) {
        secondApplied.resolve()
        await releaseSecond.promise
      }
      return result
    }

    try {
      first = boundary.materialize({parts: [{
        part: "inflaton",
        op: "add",
        path: "field",
        value: {wimp: ROOT, id: 1, key: "phase", type: "string"},
        ts: 2,
      }]})
      await firstApplied.promise

      const settled = [false, false, false, false]
      const track = <T>(index: number, promise: Promise<T>): Promise<T> => promise.finally(() => {
        settled[index] = true
      })
      const reads = [
        track(0, boundary.initialState()),
        track(1, boundary.initialProjection()),
        track(2, boundary.replay()),
        track(3, boundary.graphSnapshot()),
      ] as const
      second = boundary.materialize({parts: [{
        part: "inflaton",
        op: "remove",
        path: "field",
        value: {wimp: ROOT, id: 1},
        ts: 3,
      }]})

      await Bun.sleep(0)
      expect(settled).toEqual([false, false, false, false])

      releaseFirst.resolve()
      const [initialState, initialProjection, replay, graphSnapshot] = await Promise.all(reads)
      await secondApplied.promise

      expect(initialState.declarations.some((entry) =>
        entry.section === "fields" && keyOf(entry.value) === "phase"
      )).toBe(true)
      expect(initialProjection.entries.some((entry) =>
        entry.path === "field" && keyOf(entry.value) === "phase"
      )).toBe(true)
      expect(replay.some((message) => {
        const part = message.parts[0]
        return part.path === "field" && keyOf(part.value) === "phase"
      })).toBe(true)
      expect(graphSnapshot.initialState.declarations.some((entry) =>
        entry.section === "fields" && keyOf(entry.value) === "phase"
      )).toBe(true)
      expect(graphSnapshot.initialProjection.entries.some((entry) =>
        entry.path === "field" && keyOf(entry.value) === "phase"
      )).toBe(true)
      expect(settled).toEqual([true, true, true, true])

      releaseSecond.resolve()
      await Promise.all([first, second])
      expect((await boundary.initialState()).declarations.some((entry) =>
        entry.section === "fields" && keyOf(entry.value) === "phase"
      )).toBe(false)
    } finally {
      releaseFirst.resolve()
      releaseSecond.resolve()
      await Promise.allSettled([first, second].filter((item): item is Promise<unknown> => item !== undefined))
      boundary.projection.apply = originalApply
    }
  })

  test("keeps canonical Variant identity in Atom, default and Condition values", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})
    await declaration("field", 1, {key: "mode", type: "enum", default: "old", position: 0})
    await declaration("variant", 1, {field: 1, position: 0, value: "old"})
    await declaration("variant", 2, {field: 1, position: 1, value: "other"})
    await declaration("state", 1, {name: "idle", position: 0})
    await declaration("state", 2, {name: "done", position: 1})
    await declaration("transition", 1, {from: 1, to: 2, position: 0})
    const variantId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const ref = {kind: "enum", variant: variantId}
    const conditionCommit = await boundary.materialize({parts: [{
      part: "inflaton",
      op: "add",
      path: "condition",
      value: {wimp: ROOT, id: 1, transition: 1, field: 1, position: 0, predicate: {eq: "old"}},
      ts: 1,
    }]})
    expect(conditionCommit?.messages.map((message) => message.parts[0])).toContainEqual(expect.objectContaining({
      part: "graviton",
      path: "condition",
      value: expect.objectContaining({predicate: {eq: ref}}),
    }))

    const initial = await boundary.initialState()
    const variant = initial.declarations.find((item) =>
      item.section === "variants" && item.value.itemValue === "old",
    )
    expect(Number(variant?.value.id)).toBe(variantId)

    expect(initial.atoms[0]?.values[0]?.value).toEqual(ref)
    expect(initial.declarations.find((item) => item.section === "fields")?.value.default).toEqual(ref)
    expect(initial.declarations.find((item) => item.section === "conditions")?.value.predicate).toEqual({eq: ref})
    const replay = await boundary.replay()
    expect(replay.map((message) => message.parts[0])).toContainEqual(expect.objectContaining({
      path: "field",
      value: expect.objectContaining({default: ref}),
    }))
    expect(replay.map((message) => message.parts[0])).toContainEqual(expect.objectContaining({
      path: "condition",
      value: expect.objectContaining({predicate: {eq: ref}}),
    }))

    await expect(apply({
      part: "inflaton",
      op: "remove",
      path: "variant",
      value: {wimp: ROOT, id: 1},
    })).rejects.toThrow("Cannot remove referenced Variant")
    await expect(apply({
      part: "inflaton",
      op: "remove",
      path: "variant",
      value: {wimp: ROOT, id: 2},
    })).resolves.toBeUndefined()

    const afterRemoval = await boundary.initialState()
    expect(afterRemoval.declarations.filter((item) => item.section === "variants")).toHaveLength(1)
    expect(afterRemoval.atoms[0]?.values[0]?.value).toEqual(ref)
  })
})
