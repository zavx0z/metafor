import {describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {EnergyCatalogStore} from "./catalog.ts"

const part = (op: Particle["op"], path: string, value?: unknown, from?: string): Particle => ({
  part: "graviton", op, path,
  ...(value !== undefined ? {value} : {}),
  ...(from !== undefined ? {from} : {}),
})

const actor = (id: number, wimp: string, parentActor: number | null = null) => ({
  actor: {id, parentActor, parentTopology: null, wimp, position: id},
})

const process = (id: number, wimp: string, state: string) => ({
  id, wimp, state,
  descriptor: {
    type: "action" as const,
    key: state,
    env: ["server"],
    action: {src: "./action.ts", readFields: []},
  },
})

describe("Energy incremental catalog", () => {
  test("process replace retains its identity and does not recreate another process", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "declaration/owner/a/processes/1", process(101, "owner/a", "ready")))
    store.apply(part("add", "declaration/owner/a/processes/2", process(102, "owner/a", "done")))
    const ready = store.process("owner/a", "ready")
    const done = store.process("owner/a", "done")

    store.apply(part("replace", "declaration/owner/a/processes/1", {descriptor: {env: ["worker"]}}))

    expect(store.process("owner/a", "ready")).toBe(ready)
    expect(store.process("owner/a", "ready")?.descriptor.env).toEqual(["worker"])
    expect(store.process("owner/a", "done")).toBe(done)
  })

  test("actor parent patch reindexes locally and preserves peers", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "actor/1", actor(1, "owner/root")))
    store.apply(part("add", "actor/2", actor(2, "owner/child", 1)))
    store.apply(part("add", "actor/3", actor(3, "owner/root")))
    const child = store.actors.get(2)
    const peer = store.actors.get(3)

    store.apply(part("replace", "actor/2", {actor: {parentActor: 3}}))

    expect(store.actors.get(2)).toBe(child)
    expect(store.actors.get(3)).toBe(peer)
    expect(store.childrenByParent.get("actor:1")).toBeUndefined()
    expect(store.childrenByParent.get("actor:3")).toEqual(new Set(["actor:2"]))
  })

  test("remove affects only process actors of the same WIMP", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "actor/1", actor(1, "owner/a")))
    store.apply(part("add", "actor/2", actor(2, "owner/b")))
    store.apply(part("add", "declaration/owner/a/processes/1", process(101, "owner/a", "ready")))

    const change = store.apply(part("remove", "declaration/owner/a/processes/1"))

    expect(change.affectedActorIds).toEqual([1])
    expect(store.actors.has(2)).toBe(true)
  })

  test("copy, move and test operate on one entity", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "actor/1", actor(1, "owner/a")))
    store.apply(part("copy", "actor/2", undefined, "actor/1"))
    expect(store.actors.get(2)).not.toBe(store.actors.get(1))

    const original = store.actors.get(1)
    store.apply(part("move", "actor/3", undefined, "actor/1"))
    expect(store.actors.get(3)).toBe(original)
    expect(() => store.apply(part("test", "actor/3", store.actors.get(3)))).not.toThrow()
    expect(() => store.apply(part("test", "actor/3", {id: 9}))).toThrow("test failed")
  })
})
