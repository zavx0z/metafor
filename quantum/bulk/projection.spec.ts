import {describe, expect, test} from "bun:test"
import type {Particle} from "shared/protocol/force/particle"
import {BulkProjectionStore} from "./projection.ts"

const part = (op: Particle["op"], path: string, value?: unknown, from?: string): Particle => ({
  part: "graviton", op, path, ts: 1,
  ...(value !== undefined ? {value} : {}),
  ...(from !== undefined ? {from} : {}),
})

const atom = (id: number, wimp: string, parentAtom: number | null = null) => ({
  atom: {id, parentAtom, parentTopology: null, wimp, position: id},
  values: [], valueRecords: [], valueItems: [], state: null,
})

describe("Bulk incremental projection", () => {
  test("local atom replacement retains scene entity identity and peer identity", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "atom/2", atom(2, "owner/child", 1)))
    store.apply(part("add", "atom/3", atom(3, "owner/peer")))
    const child = store.atoms.get(2)
    const peer = store.atoms.get(3)

    store.apply(part("replace", "atom/2", {atom: {position: 8}}))

    expect(store.atoms.get(2)).toBe(child)
    expect(store.atoms.get(2)?.position).toBe(8)
    expect(store.atoms.get(3)).toBe(peer)
  })

  test("parent-child indexes move one branch without recreating it", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "atom/2", atom(2, "owner/child", 1)))
    store.apply(part("add", "atom/3", atom(3, "owner/root")))
    const child = store.atoms.get(2)

    store.apply(part("replace", "atom/2", {atom: {parentAtom: 3}}))

    expect(store.atoms.get(2)).toBe(child)
    expect(store.childrenByParent.get("atom:1")).toBeUndefined()
    expect(store.childrenByParent.get("atom:3")).toEqual(new Set(["atom:2"]))
  })

  test("declaration patch updates only its canonical record in place", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "wimp", {src: "owner/root", name: "Root"}))
    store.apply(part("add", "field", {id: 101, localId: 1, wimp: "owner/root", key: "name", type: "string", label: "Name"}))
    store.apply(part("add", "field", {id: 102, localId: 2, wimp: "owner/root", key: "count", type: "number", label: "Count"}))
    const field = store.fields.get(101)
    const peer = store.fields.get(102)

    store.apply(part("replace", "field", {id: 101, localId: 1, wimp: "owner/root", key: "name", type: "string", label: "Title"}))

    expect(store.fields.get(101)).toBe(field)
    expect(store.fields.get(101)?.label).toBe("Title")
    expect(store.fields.get(102)).toBe(peer)
  })

  test("gluon changes one atom value without structural rebuild", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    const change = store.apply({part: "gluon", op: "replace", path: 1, ts: 1, value: {fields: {"101": "new"}}})

    expect(change).toEqual({changed: true, affectedAtomIds: [1], facet: "field-value", structural: false})
    const binding = store.atomValues.get(["1", "101"].join("\0"))
    expect(binding).toBeDefined()
    expect(store.values.get(binding!.value)?.textValue).toBe("new")
  })

  test("replay and Photon keep the Atom current State in the same projection", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "state", {id: 201, localId: 1, wimp: "owner/root", name: "idle", position: 0}))
    store.apply(part("add", "state", {id: 202, localId: 2, wimp: "owner/root", name: "ready", position: 1}))
    store.apply(part("add", "atom/1", {...atom(1, "owner/root"), state: {atom: 1, metaState: 201}}))

    expect(store.atomStates.get(1)?.state).toBe(201)
    expect(store.apply({part: "photon", op: "replace", path: 1, ts: 1, value: "ready"})).toEqual({
      changed: true,
      affectedAtomIds: [1],
      facet: "current-state",
      structural: false,
    })
    expect(store.atomStates.get(1)?.state).toBe(202)
  })

  test("remove drops one branch while retaining an unrelated root", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "atom/1", atom(1, "owner/root")))
    store.apply(part("add", "atom/2", atom(2, "owner/child", 1)))
    store.apply(part("add", "atom/3", atom(3, "owner/peer")))
    const peer = store.atoms.get(3)

    store.apply(part("remove", "atom/1"))

    expect(store.atoms.has(1)).toBe(false)
    expect(store.atoms.has(2)).toBe(false)
    expect(store.atoms.get(3)).toBe(peer)
  })

  test("copy, move and test keep operations granular", () => {
    const store = new BulkProjectionStore()
    store.apply(part("add", "atom/1", {...atom(1, "owner/root"), state: {atom: 1, metaState: 201}}))
    store.apply(part("copy", "atom/2", undefined, "atom/1"))
    expect(store.atoms.get(2)).not.toBe(store.atoms.get(1))

    const original = store.atoms.get(1)
    store.apply(part("move", "atom/3", undefined, "atom/1"))
    expect(store.atoms.get(3)).toBe(original)
    expect(store.atomStates.get(1)).toBeUndefined()
    expect(store.atomStates.get(3)).toEqual({atom: 3, state: 201})
    expect(() => store.apply(part("test", "atom/3", store.atoms.get(3)))).not.toThrow()
    expect(() => store.apply(part("test", "atom/3", {id: 99}))).toThrow("test failed")
  })

  test("snapshot hydrates a new Store that can continue ordinary Particle updates", () => {
    const original = new BulkProjectionStore()
    original.apply(part("add", "wimp", {src: "owner/root", name: "Root"}))
    original.apply(part("add", "field", {id: 101, localId: 1, wimp: "owner/root", key: "name", type: "string", label: "Name"}))
    original.apply(part("add", "atom/1", atom(1, "owner/root")))

    const hydrated = new BulkProjectionStore()
    hydrated.hydrate(original.snapshot())
    hydrated.apply(part("remove", "field", {wimp: "owner/root", localId: 1}))

    expect(hydrated.view()).toEqual(expect.objectContaining({
      atoms: original.view().atoms,
      wimps: original.view().wimps,
      fields: [],
    }))
  })

})
