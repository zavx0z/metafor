import {describe, expect, test} from "bun:test"
import type {Particle} from "shared/protocol/force/particle"
import {EnergyCatalogStore} from "../../energy/graph/catalog.ts"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

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
  test("hydrates canonical Fields and enum variants for the external action contract", () => {
    const catalog = new EnergyCatalogStore()
    catalog.apply(part("add", "field", {
      id: 3, wimp: "owner/process", localId: 1, key: "mode", type: "enum",
      required: true, label: "Mode", default: "idle",
    }))
    catalog.apply(part("add", "variant", {
      id: 7, wimp: "owner/process", localId: 1, field: 3, position: 0, itemValue: "idle",
    }))
    catalog.apply(part("add", "variant", {
      id: 8, wimp: "owner/process", localId: 2, field: 3, position: 1, itemValue: "ready",
    }))

    expect(catalog.fieldSchema("owner/process")).toEqual({
      mode: {type: "enum", required: true, default: "idle", label: "Mode", values: ["idle", "ready"]},
    })
  })

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

  test("returns destroy hooks by declaration local ID instead of arrival order", () => {
    const store = new EnergyCatalogStore()
    for (const localId of [3, 1, 2]) {
      store.apply(part("add", "process", {
        ...process(100 + localId, localId, "owner/a", `cleanup-${localId}`),
        descriptor: {
          type: "finally",
          key: `cleanup-${localId}`,
          env: ["server"],
          before: {src: "async () => {}"},
        },
      }))
    }

    expect(store.destroyProcesses("owner/a").map(({state}) => state)).toEqual([
      "cleanup-1",
      "cleanup-2",
      "cleanup-3",
    ])
  })

  test("atom parent patch reindexes locally and preserves peers", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "atom/2", atom(2, "owner/child", 1)))
    store.apply(part("add", "atom/3", atom(3, "owner/root")))
    store.apply(part("add", "atom/4", atom(4, "owner/grandchild", 2)))
    const child = store.atoms.get(2)
    const peer = store.atoms.get(3)

    const change = store.apply(part("replace", "atom/2", {atom: {parentAtom: 3}}))

    expect(change.affectedAtomIds).toEqual([2])
    expect(store.atoms.get(2)).toBe(child)
    expect(store.atoms.get(3)).toBe(peer)
    expect(store.childrenByParent.get("atom:1")).toBeUndefined()
    expect(store.childrenByParent.get("atom:3")).toEqual(new Set(["atom:2"]))
  })

  test("keeps Matter continuation separate and resolves the owning Atom through topology", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "topology/7", {
      id: 7,
      parentAtom: 1,
      parentTopology: null,
      kind: "axion",
      position: 0,
    }))
    store.apply(part("add", "atom/2", {
      atom: {id: 2, parentAtom: null, parentTopology: 7, wimp: "owner/child", position: 0},
      continuation: {
        massBinding: {
          data: "/mass/cache",
          directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
        },
        energyBinding: {data: "/energy/socket"},
      },
    }))

    expect(store.parentAtom(2)).toBe(store.atoms.get(1))
    expect(store.continuation(2)).toEqual({
      massBinding: {
        data: "/mass/cache",
        directMass: {kind: "keys", entries: [{target: "cache", source: "cache"}]},
      },
      energyBinding: {data: "/energy/socket"},
    })
    expect("continuation" in store.atoms.get(2)!).toBe(false)

    const topologyChange = store.apply(part("replace", "topology/7", {
      id: 7,
      parentAtom: 1,
      parentTopology: null,
      kind: "axion",
      position: 1,
    }))
    expect(topologyChange.affectedAtomIds).toEqual([])

    store.apply(part("replace", "atom/2", {
      atom: {id: 2, parentAtom: null, parentTopology: 7, wimp: "owner/child", position: 0},
      continuation: {},
    }))
    expect(store.continuation(2)).toEqual({})
  })

  test("resolves stable public Graph refs independently from topology and sibling order", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", {
      atom: {id: 1, parentAtom: null, parentTopology: null, wimp: "owner/root", position: 0},
    }))
    store.apply(part("add", "atom/3", {
      atom: {id: 3, parentAtom: 1, parentTopology: null, wimp: "owner/direct", position: 1},
    }))
    store.apply(part("add", "topology/7", {
      id: 7, parentAtom: 1, parentTopology: null, kind: "axion", position: 0,
    }))
    store.apply(part("add", "atom/2", {
      atom: {id: 2, parentAtom: null, parentTopology: 7, wimp: "owner/child", position: 0},
    }))

    expect(store.resolveAtom({
      root: parseMetaAddress("owner/root")!,
      ref: "atom:2",
      meta: parseMetaAddress("owner/child")!,
    })?.id).toBe(2)
    expect(store.resolveAtom({
      root: parseMetaAddress("owner/root")!,
      ref: "atom:3",
      meta: parseMetaAddress("owner/direct")!,
    })?.id).toBe(3)
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

  test("treats a Matter Graviton as a rebuild of every Atom of its WIMP", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/a")))
    store.apply(part("add", "atom/2", atom(2, "owner/a")))
    store.apply(part("add", "atom/3", atom(3, "owner/b")))

    const change = store.apply(part("replace", "matter", {
      id: 41,
      localId: 1,
      wimp: "owner/a",
      kind: "wimp",
      src: "owner/child",
    }))

    expect(change).toEqual({changed: true, affectedAtomIds: [1, 2]})
    expect(store.atoms.has(3)).toBe(true)
  })

  test("invalidates Process only for Matrix restart scopes", () => {
    const store = new EnergyCatalogStore()
    store.apply(part("add", "atom/1", atom(1, "owner/a")))
    store.apply(part("add", "atom/2", atom(2, "owner/a")))
    store.apply(part("add", "atom/3", atom(3, "owner/b")))
    const declaration = process(101, 1, "owner/a", "ready")
    store.apply(part("add", "process", declaration))

    expect(store.invalidatedProcessAtomIds(part("replace", "atom/1", atom(1, "owner/a")))).toEqual([])
    expect(store.invalidatedProcessAtomIds(part("replace", "atom/1", atom(1, "owner/b")))).toEqual([1])
    expect(store.invalidatedProcessAtomIds(part("replace", "process", declaration))).toEqual([1, 2])
    expect(store.invalidatedProcessAtomIds(part("replace", "matter", {
      wimp: "owner/a",
      localId: 1,
    }))).toEqual([1, 2])
  })

  test("clears a removed continuation and invalidates only that Atom", () => {
    const store = new EnergyCatalogStore()
    const withContinuation = {
      ...atom(1, "owner/a"),
      values: [],
      valueRecords: [],
      valueItems: [],
      state: {atom: 1, metaState: null},
      continuation: {massBinding: {cache: "old"}, energyBinding: {socket: "old"}},
    }
    const withoutContinuation = {
      ...atom(1, "owner/a"),
      values: [],
      valueRecords: [],
      valueItems: [],
      state: {atom: 1, metaState: null},
    }
    store.apply(part("add", "atom/1", withContinuation))

    expect(store.invalidatedProcessAtomIds(part("replace", "atom/1", withoutContinuation))).toEqual([1])
    store.apply(part("replace", "atom/1", withoutContinuation))
    expect(store.continuation(1)).toBeUndefined()
  })

  test("keeps a child outside its parent's canonical Atom replacement", () => {
    const store = new EnergyCatalogStore()
    const parent = {
      ...atom(1, "owner/process"),
      values: [],
      valueRecords: [],
      valueItems: [],
      state: {atom: 1, metaState: null},
    }
    store.apply(part("add", "atom/1", parent))
    store.apply(part("add", "atom/2", {
      ...atom(2, "owner/process", 1),
      values: [],
      valueRecords: [],
      valueItems: [],
      state: {atom: 2, metaState: null},
    }))

    const replacement = part("replace", "atom/1", {
      ...parent,
      atom: {...parent.atom, position: 7},
    })
    expect(store.affectedAtomIds(replacement)).toEqual([1])
    expect(store.invalidatedProcessAtomIds(replacement)).toEqual([1])
    expect(store.apply(replacement).affectedAtomIds).toEqual([1])
    expect(store.apply(part("replace", "atom/1", replacement.value)).affectedAtomIds).toEqual([1])
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
