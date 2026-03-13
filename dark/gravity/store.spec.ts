import { beforeEach, describe, expect, test } from "bun:test"
import { gravity$ } from "./store"

function atom(address: string, meta = "/meta/shared") {
  return { address, meta }
}

describe("dark/gravity/store", () => {
  beforeEach(() => {
    gravity$.reset()
  })

  test("gravity$ является singleton-объектом с методами", () => {
    expect(typeof gravity$.reset).toBe("function")
    expect(typeof gravity$.createState).toBe("function")
  })

  test("createChildren/createBefore/createAfter удерживают порядок siblings", () => {
    gravity$.createChildren(null, atom("a", "/meta/a"))
    gravity$.createChildren(null, atom("c", "/meta/c"))
    gravity$.createBefore("c", atom("b", "/meta/b"))
    gravity$.createAfter("b", atom("b2", "/meta/b2"))

    expect(gravity$.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "b2", "c"])
    expect(gravity$.getChildren(null).map((entry) => entry.path)).toEqual(["0", "1", "2", "3"])
  })

  test("createBetween сохраняет стабильный порядок при плотных вставках между теми же соседями", () => {
    gravity$.createChildren(null, atom("L"))
    gravity$.createChildren(null, atom("R"))

    for (let index = 0; index < 8; index++) {
      gravity$.createBetween("L", "R", atom(`X${index}`))
    }

    expect(gravity$.getChildren(null).map((entry) => entry.address)).toEqual([
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
    gravity$.createNode("0", atom("root-a", "/meta/a"))
    gravity$.createNode("1", atom("root-c", "/meta/c"))
    gravity$.createNode("1", atom("root-b", "/meta/b"))
    gravity$.createNode("1/0", atom("leaf", "/meta/leaf"))

    expect(gravity$.getPath("root-a")).toBe("0")
    expect(gravity$.getPath("root-b")).toBe("1")
    expect(gravity$.getPath("root-c")).toBe("2")
    expect(gravity$.getAtom("leaf")?.path).toBe("1/0")
    expect(gravity$.getNode("1")?.address).toBe("root-b")
    expect(gravity$.getNode("1/0")?.address).toBe("leaf")
  })

  test("reserveSibling + attachReserved ставят будущий атом в зарезервированный slot", () => {
    gravity$.createChildren(null, atom("a"))
    gravity$.createChildren(null, atom("c"))
    gravity$.reserveSibling("b", "c", "before")
    gravity$.attachReserved(atom("b"))

    expect(gravity$.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(gravity$.getAtom("b")?.path).toBe("1")
  })

  test("reserveByIndexPath резервирует позицию по индексному пути", () => {
    gravity$.createChildren(null, atom("a"))
    gravity$.createChildren(null, atom("c"))
    gravity$.reserveByIndexPath("b", "1")
    gravity$.attachReserved(atom("b"))

    expect(gravity$.getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(gravity$.getNode("1")?.address).toBe("b")
    expect(gravity$.getNode("2")?.address).toBe("c")
  })

  test("temporary state snapshot/restore сохраняет структуру и reuse одного meta", () => {
    const state = gravity$.createState<{ name: string }>()

    state.meta.set("/meta/user", { name: "user" })
    gravity$.createChildren(null, atom("user-1", "/meta/user"), state)
    gravity$.createChildren(null, atom("user-2", "/meta/user"), state)

    const snapshot = gravity$.snapshot(state)
    const restored = gravity$.createState<{ name: string }>()
    gravity$.restore(snapshot, restored)

    expect(restored.meta.size).toBe(1)
    expect(restored.atom.size).toBe(2)
    expect(gravity$.getChildren(null, restored).map((entry) => entry.meta)).toEqual(["/meta/user", "/meta/user"])
    expect(gravity$.getChildren(null, restored).map((entry) => entry.path)).toEqual(["0", "1"])
  })
})
