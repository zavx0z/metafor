import { beforeEach, describe, expect, test } from "bun:test"
import {
  attachReserved,
  createAfter,
  createBefore,
  createBetween,
  createChildren,
  createNode,
  getAtom,
  getChildren,
  getNode,
  getPath,
  resetGravity,
  reserveByIndexPath,
  reserveSibling,
} from "./gravity"
import { between } from "./key"
import { gravity$ } from "./store"

function atom(address: string, meta = "/meta/shared") {
  return { address, meta }
}

describe("dark/gravity/store", () => {
  beforeEach(() => {
    resetGravity()
  })

  test("gravity$ является singleton-store объектом с default state без factory API", async () => {
    expect(typeof gravity$.reset).toBe("function")
    expect(typeof gravity$.restore).toBe("function")
    expect(gravity$.atom.size).toBe(0)
    expect(gravity$.children.size).toBe(0)
    expect("createState" in gravity$).toBe(false)

    const gravityModule = await import("./gravity")
    expect(typeof gravityModule.createChildren).toBe("function")
  })

  test("snapshot/restore восстанавливают structural state", () => {
    createChildren(null, atom("a"))
    createChildren("a", atom("leaf"))

    const snapshot = gravity$.snapshot()
    gravity$.reset()

    expect(gravity$.atom.size).toBe(0)
    expect(gravity$.children.size).toBe(0)

    gravity$.restore(snapshot)

    expect(getPath("a")).toBe("0")
    expect(getPath("leaf")).toBe("0/0")
  })

  test("between сохраняет стабильный лексикографический порядок", () => {
    expect(Array.from(between(null, null))).toEqual([128])
    expect(compareUint8(between(Uint8Array.from([10]), Uint8Array.from([20])), Uint8Array.from([10]))).toBeGreaterThan(0)
    expect(compareUint8(between(Uint8Array.from([10]), Uint8Array.from([20])), Uint8Array.from([20]))).toBeLessThan(0)
  })

  test("createChildren/createBefore/createAfter удерживают порядок siblings", () => {
    createChildren(null, atom("a", "/meta/a"))
    createChildren(null, atom("c", "/meta/c"))
    createBefore("c", atom("b", "/meta/b"))
    createAfter("b", atom("b2", "/meta/b2"))

    expect(getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "b2", "c"])
    expect(getChildren(null).map((entry) => getPath(entry.address))).toEqual(["0", "1", "2", "3"])
  })

  test("createBetween сохраняет стабильный порядок при плотных вставках между теми же соседями", () => {
    createChildren(null, atom("L"))
    createChildren(null, atom("R"))

    for (let index = 0; index < 8; index++) {
      createBetween("L", "R", atom(`X${index}`))
    }

    expect(getChildren(null).map((entry) => entry.address)).toEqual([
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
    createNode("0", atom("root-a", "/meta/a"))
    createNode("1", atom("root-c", "/meta/c"))
    createNode("1", atom("root-b", "/meta/b"))
    createNode("1/0", atom("leaf", "/meta/leaf"))

    expect(getPath("root-a")).toBe("0")
    expect(getPath("root-b")).toBe("1")
    expect(getPath("root-c")).toBe("2")
    expect(getNode("1")?.address).toBe("root-b")
    expect(getNode("1/0")?.address).toBe("leaf")
  })

  test("reserveSibling + attachReserved ставят будущий атом в зарезервированный slot", () => {
    createChildren(null, atom("a"))
    createChildren(null, atom("c"))
    reserveSibling("b", "c", "before")
    attachReserved(atom("b"))

    expect(getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(getAtom("b")?.parent).toBe(null)
    expect(getPath("b")).toBe("1")
  })

  test("reserveByIndexPath резервирует позицию по индексному пути", () => {
    createChildren(null, atom("a"))
    createChildren(null, atom("c"))
    reserveByIndexPath("b", "1")
    attachReserved(atom("b"))

    expect(getChildren(null).map((entry) => entry.address)).toEqual(["a", "b", "c"])
    expect(getNode("1")?.address).toBe("b")
    expect(getNode("2")?.address).toBe("c")
  })

  test("повторное использование одного meta остаётся валидным", () => {
    createChildren(null, atom("user-1", "/meta/user"))
    createChildren(null, atom("user-2", "/meta/user"))

    expect(getChildren(null).map((entry) => entry.meta)).toEqual(["/meta/user", "/meta/user"])
    expect(getChildren(null).map((entry) => getPath(entry.address))).toEqual(["0", "1"])
  })
})

function compareUint8(a: Uint8Array, b: Uint8Array): number {
  const size = Math.min(a.length, b.length)

  for (let index = 0; index < size; index++) {
    const delta = a[index]! - b[index]!
    if (delta !== 0) {
      return delta
    }
  }

  return a.length - b.length
}
