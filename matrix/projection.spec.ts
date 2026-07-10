import {describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {MatrixProjectionStore} from "./projection.ts"

const graviton = (op: Particle["op"], path: string, value?: unknown, from?: string): Particle => ({
  part: "graviton",
  op,
  path,
  ...(value !== undefined ? {value} : {}),
  ...(from !== undefined ? {from} : {}),
})

const actor = (id: number, wimp: string, parentActor: number | null = null) => ({
  actor: {id, parentActor, parentTopology: null, wimp, position: id},
  values: [],
  valueRecords: [],
  valueItems: [],
  state: null,
})

describe("Matrix incremental projection", () => {
  test("local replace retains addressed and unrelated actor identities", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/root")))
    store.apply(graviton("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(graviton("add", "actor/3", actor(3, "owner/peer")))
    const child = store.actors.get(2)
    const peer = store.actors.get(3)

    const change = store.apply(graviton("replace", "actor/2", {actor: {position: 7}}))

    expect(change.affectedActorIds).toEqual([2])
    expect(store.actors.get(2)).toBe(child)
    expect(store.actors.get(2)?.actor.position).toBe(7)
    expect(store.actors.get(3)).toBe(peer)
    expect(store.childrenByParent.get("actor:1")).toEqual(new Set(["actor:2"]))
  })

  test("parent move reindexes only the moved branch", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/root")))
    store.apply(graviton("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(graviton("add", "actor/3", actor(3, "owner/root")))
    const root = store.actors.get(1)
    const moved = store.actors.get(2)

    store.apply(graviton("replace", "actor/2", {actor: {parentActor: 3}}))

    expect(store.actors.get(1)).toBe(root)
    expect(store.actors.get(2)).toBe(moved)
    expect(store.childrenByParent.get("actor:1")).toBeUndefined()
    expect(store.childrenByParent.get("actor:3")).toEqual(new Set(["actor:2"]))
  })

  test("remove deletes only the addressed parent-child branch", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/root")))
    store.apply(graviton("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(graviton("add", "actor/3", actor(3, "owner/peer")))
    const peer = store.actors.get(3)

    store.apply(graviton("remove", "actor/1"))

    expect(store.actors.has(1)).toBe(false)
    expect(store.actors.has(2)).toBe(false)
    expect(store.actors.get(3)).toBe(peer)
  })

  test("declaration patch affects only actors of its WIMP and retains records", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/a")))
    store.apply(graviton("add", "actor/2", actor(2, "owner/b")))
    store.apply(graviton("add", "declaration/owner/a/fields/1", {id: 101, wimp: "owner/a", key: "count", type: "number"}))
    const field = store.declaration("owner/a", "fields")[0]

    const change = store.apply(graviton("replace", "declaration/owner/a/fields/1", {label: "Count"}))

    expect(change.affectedActorIds).toEqual([1])
    expect(store.declaration("owner/a", "fields")[0]).toBe(field)
    expect(field?.label).toBe("Count")
  })

  test("copy, move and test use entity paths without clearing the store", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/a")))
    store.apply(graviton("copy", "actor/2", undefined, "actor/1"))
    expect(store.actors.get(2)).not.toBe(store.actors.get(1))
    expect(store.actors.get(2)?.actor.id).toBe(2)

    const original = store.actors.get(1)
    store.apply(graviton("move", "actor/3", undefined, "actor/1"))
    expect(store.actors.get(3)).toBe(original)
    expect(store.actors.get(3)?.actor.id).toBe(3)
    expect(() => store.apply(graviton("test", "actor/3", store.actors.get(3)))).not.toThrow()
    expect(() => store.apply(graviton("test", "actor/3", {actor: {id: 99}}))).toThrow("test failed")
  })

  test("gluon update changes only one actor field map", () => {
    const store = new MatrixProjectionStore()
    store.apply(graviton("add", "actor/1", actor(1, "owner/a")))
    store.apply(graviton("add", "actor/2", actor(2, "owner/a")))
    const untouched = store.fieldValuesByActorId.get(2)

    const change = store.applyFields({part: "gluon", op: "replace", path: 1, value: {fields: {"101": 42}}})

    expect(change.affectedActorIds).toEqual([1])
    expect(store.fieldValuesByActorId.get(1)?.get(101)).toBe(42)
    expect(store.fieldValuesByActorId.get(2)).toBe(untouched)
  })
})
