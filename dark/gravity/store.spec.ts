import { describe, expect, test } from "bun:test"
import { dark$ } from "../store"
import { GravityStore, gravity$ } from "./store"

function atom(address: string, meta = "/meta/shared") {
  return { address, meta }
}

describe("dark/gravity/store", () => {
  test("createChildren/createBefore/createAfter удерживают порядок siblings", () => {
    const store = new GravityStore()

    store.createChildren(null, atom("a", "/meta/a"))
    store.createChildren(null, atom("c", "/meta/c"))
    store.createBefore("c", atom("b", "/meta/b"))
    store.createAfter("b", atom("b2", "/meta/b2"))

    expect(store.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "b2", "c"])
    expect(store.getChildren(null).map((entry) => entry.path)).toEqual(["0", "1", "2", "3"])
  })

  test("createBetween сохраняет стабильный порядок при плотных вставках между теми же соседями", () => {
    const store = new GravityStore()

    store.createChildren(null, atom("L"))
    store.createChildren(null, atom("R"))

    for (let index = 0; index < 8; index++) {
      store.createBetween("L", "R", atom(`X${index}`))
    }

    expect(store.getChildren(null).map((entry) => entry.address)).toEqual([
      "L",
      "X0",
      "X1",
      "X2",
      "X3",
      "X4",
      "X5",
      "X6",
      "X7",
      "R",
    ])
  })

  test("createNode/getNode/getPath выводят path из реальной позиции в дереве", () => {
    const store = new GravityStore()

    store.createNode("0", atom("root-a", "/meta/a"))
    store.createNode("1", atom("root-c", "/meta/c"))
    store.createNode("1", atom("root-b", "/meta/b"))
    store.createNode("1/0", atom("leaf", "/meta/leaf"))

    expect(store.getPath("root-a")).toBe("0")
    expect(store.getPath("root-b")).toBe("1")
    expect(store.getPath("root-c")).toBe("2")
    expect(store.getAtom("leaf")?.path).toBe("1/0")
    expect(store.getNode("1")?.address).toBe("root-b")
    expect(store.getNode("1/0")?.address).toBe("leaf")
  })

  test("reserveSibling + attachReserved ставят будущий атом в зарезервированный slot", () => {
    const store = new GravityStore()

    store.createChildren(null, atom("a"))
    store.createChildren(null, atom("c"))
    store.reserveSibling("b", "c", "before")
    store.attachReserved(atom("b"))

    expect(store.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(store.getAtom("b")?.path).toBe("1")
  })

  test("reserveByIndexPath резервирует позицию по индексному пути", () => {
    const store = new GravityStore()

    store.createChildren(null, atom("a"))
    store.createChildren(null, atom("c"))
    store.reserveByIndexPath("b", "1")
    store.attachReserved(atom("b"))

    expect(store.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(store.getNode("1")?.address).toBe("b")
    expect(store.getNode("2")?.address).toBe("c")
  })

  test("один и тот же meta address может быть использован несколькими атомами", () => {
    const store = new GravityStore<{ name: string }>()

    store.meta.set("/meta/user", { name: "user" })
    store.createChildren(null, atom("user-1", "/meta/user"))
    store.createChildren(null, atom("user-2", "/meta/user"))

    expect(store.meta.size).toBe(1)
    expect(store.atom.size).toBe(2)
    expect(store.getChildren(null).map((entry) => entry.meta)).toEqual(["/meta/user", "/meta/user"])
    expect(store.getChildren(null).map((entry) => entry.path)).toEqual(["0", "1"])
  })

  test("dark$ использует тот же singleton store, что и gravity$", () => {
    gravity$.reset()

    gravity$.createChildren(null, atom("root", "/meta/root"))

    expect(dark$).toBe(gravity$)
    expect(dark$.getAtom("root")?.path).toBe("0")

    gravity$.reset()
  })
})
