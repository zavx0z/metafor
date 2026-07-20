import {describe, expect, test} from "bun:test"
import type {Particle} from "shared/protocol/force/particle"
import {EnergyCatalogStore} from "./catalog.ts"

const part = (op: Particle["op"], path: string, value?: unknown, from?: string): Particle => ({
  part: "graviton", op, path, ts: 1,
  ...(value !== undefined ? {value} : {}),
  ...(from !== undefined ? {from} : {}),
})

const atom = (id: number, wimp: string, parentAtom: number | null = null) => ({
  atom: {id, parentAtom, parentTopology: null, wimp, position: id},
})

const process = (id: number, localId: number, wimp: string, state: string) => ({
  id, localId, wimp, state,
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
    store.apply(part("add", "process", process(101, 1, "owner/a", "ready")))
    store.apply(part("add", "process", process(102, 2, "owner/a", "done")))
    const ready = store.process("owner/a", "ready")
    const done = store.process("owner/a", "done")

    store.apply(part("replace", "process", {
      ...process(101, 1, "owner/a", "ready"),
      descriptor: {...process(101, 1, "owner/a", "ready").descriptor, env: ["worker"]},
    }))

    expect(store.process("owner/a", "ready")).toBe(ready)
    expect(store.process("owner/a", "ready")?.descriptor.env).toEqual(["worker"])
    expect(store.process("owner/a", "done")).toBe(done)
  })

  test("atom parent patch reindexes locally and preserves peers", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "atom/2", atom(2, "owner/child", 1)))
    store.apply(part("add", "atom/3", atom(3, "owner/root")))
    const child = store.atoms.get(2)
    const peer = store.atoms.get(3)

    store.apply(part("replace", "atom/2", {atom: {parentAtom: 3}}))

    expect(store.atoms.get(2)).toBe(child)
    expect(store.atoms.get(3)).toBe(peer)
    expect(store.childrenByParent.get("atom:1")).toBeUndefined()
    expect(store.childrenByParent.get("atom:3")).toEqual(new Set(["atom:2"]))
  })

  test("remove affects only process atoms of the same WIMP", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/a")))
    store.apply(part("add", "atom/2", atom(2, "owner/b")))
    store.apply(part("add", "process", process(101, 1, "owner/a", "ready")))

    const change = store.apply(part("remove", "process", process(101, 1, "owner/a", "ready")))

    expect(change.affectedAtomIds).toEqual([1])
    expect(store.atoms.has(2)).toBe(true)
  })

  test("copy, move and test operate on one entity", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/a")))
    store.apply(part("copy", "atom/2", undefined, "atom/1"))
    expect(store.atoms.get(2)).not.toBe(store.atoms.get(1))

    const original = store.atoms.get(1)
    store.apply(part("move", "atom/3", undefined, "atom/1"))
    expect(store.atoms.get(3)).toBe(original)
    expect(() => store.apply(part("test", "atom/3", store.atoms.get(3)))).not.toThrow()
    expect(() => store.apply(part("test", "atom/3", {id: 9}))).toThrow("test failed")
  })
})
