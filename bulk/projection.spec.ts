import {describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {BulkProjectionStore} from "./projection.ts"

const part = (op: Particle["op"], path: string, value?: unknown, from?: string): Particle => ({
  part: "graviton", op, path,
  ...(value !== undefined ? {value} : {}),
  ...(from !== undefined ? {from} : {}),
})

const actor = (id: number, wimp: string, parentActor: number | null = null) => ({
  actor: {id, parentActor, parentTopology: null, wimp, position: id},
  values: [], valueRecords: [], valueItems: [], state: null,
})

describe("Bulk incremental projection", () => {
  test("local actor replacement retains scene entity identity and peer identity", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "actor/1", actor(1, "owner/root")))
    store.apply(part("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(part("add", "actor/3", actor(3, "owner/peer")))
    const child = store.actors.get(2)
    const peer = store.actors.get(3)

    store.apply(part("replace", "actor/2", {actor: {position: 8}}))

    expect(store.actors.get(2)).toBe(child)
    expect(store.actors.get(2)?.position).toBe(8)
    expect(store.actors.get(3)).toBe(peer)
  })

  test("parent-child indexes move one branch without recreating it", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "actor/1", actor(1, "owner/root")))
    store.apply(part("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(part("add", "actor/3", actor(3, "owner/root")))
    const child = store.actors.get(2)

    store.apply(part("replace", "actor/2", {actor: {parentActor: 3}}))

    expect(store.actors.get(2)).toBe(child)
    expect(store.childrenByParent.get("actor:1")).toBeUndefined()
    expect(store.childrenByParent.get("actor:3")).toEqual(new Set(["actor:2"]))
  })

  test("declaration patch updates only its canonical record in place", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "declaration/owner/root/meta/0", {id: 1, src: "owner/root", name: "Root"}))
    store.apply(part("add", "declaration/owner/root/fields/1", {id: 101, wimp: "owner/root", key: "name", type: "string", label: "Name"}))
    store.apply(part("add", "declaration/owner/root/fields/2", {id: 102, wimp: "owner/root", key: "count", type: "number", label: "Count"}))
    const field = store.fields.get(101)
    const peer = store.fields.get(102)

    store.apply(part("replace", "declaration/owner/root/fields/1", {label: "Title"}))

    expect(store.fields.get(101)).toBe(field)
    expect(store.fields.get(101)?.label).toBe("Title")
    expect(store.fields.get(102)).toBe(peer)
  })

  test("gluon changes one actor value without structural rebuild", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "actor/1", actor(1, "owner/root")))
    const change = store.apply({part: "gluon", op: "replace", path: 1, value: {fields: {"101": "new"}}})

    expect(change).toEqual({changed: true, affectedActorIds: [1], structural: false})
    const binding = store.actorValues.get(["1", "101"].join("\0"))
    expect(binding).toBeDefined()
    expect(store.values.get(binding!.value)?.textValue).toBe("new")
  })

  test("replay and Photon keep the Atom current State in the same projection", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "declaration/owner/root/states/1", {id: 201, wimp: "owner/root", name: "idle", position: 0}))
    store.apply(part("add", "declaration/owner/root/states/2", {id: 202, wimp: "owner/root", name: "ready", position: 1}))
    store.apply(part("add", "actor/1", {...actor(1, "owner/root"), state: {actor: 1, metaState: 201}}))

    expect(store.actorStates.get(1)?.state).toBe(201)
    expect(store.apply({part: "photon", op: "replace", path: 1, value: "ready"})).toEqual({
      changed: true,
      affectedActorIds: [1],
      structural: false,
    })
    expect(store.actorStates.get(1)?.state).toBe(202)
  })

  test("remove drops one branch while retaining an unrelated root", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "actor/1", actor(1, "owner/root")))
    store.apply(part("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(part("add", "actor/3", actor(3, "owner/peer")))
    const peer = store.actors.get(3)

    store.apply(part("remove", "actor/1"))

    expect(store.actors.has(1)).toBe(false)
    expect(store.actors.has(2)).toBe(false)
    expect(store.actors.get(3)).toBe(peer)
  })

  test("copy, move and test keep operations granular", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "actor/1", {...actor(1, "owner/root"), state: {actor: 1, metaState: 201}}))
    store.apply(part("copy", "actor/2", undefined, "actor/1"))
    expect(store.actors.get(2)).not.toBe(store.actors.get(1))

    const original = store.actors.get(1)
    store.apply(part("move", "actor/3", undefined, "actor/1"))
    expect(store.actors.get(3)).toBe(original)
    expect(store.actorStates.get(1)).toBeUndefined()
    expect(store.actorStates.get(3)).toEqual({actor: 3, state: 201})
    expect(() => store.apply(part("test", "actor/3", store.actors.get(3)))).not.toThrow()
    expect(() => store.apply(part("test", "actor/3", {id: 99}))).toThrow("test failed")
  })
})
