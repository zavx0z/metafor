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
import type { UUID } from "../identifier.t"

function atom(uuid: UUID, meta = "/meta/shared") {
  return { uuid, meta }
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
    const a = crypto.randomUUID()
    const leaf = crypto.randomUUID()
    createChildren(null, atom(a))
    createChildren(a, atom(leaf))

    const snapshot = gravity$.snapshot()
    gravity$.reset()

    expect(gravity$.atom.size).toBe(0)
    expect(gravity$.children.size).toBe(0)

    gravity$.restore(snapshot)

    expect(getPath(a)).toBe("0")
    expect(getPath(leaf)).toBe("0/0")
  })

  test("between сохраняет стабильный лексикографический порядок", () => {
    expect(Array.from(between(null, null))).toEqual([128])
    expect(compareUint8(between(Uint8Array.from([10]), Uint8Array.from([20])), Uint8Array.from([10]))).toBeGreaterThan(0)
    expect(compareUint8(between(Uint8Array.from([10]), Uint8Array.from([20])), Uint8Array.from([20]))).toBeLessThan(0)
  })

  test("createChildren/createBefore/createAfter удерживают порядок siblings", () => {
    const a = crypto.randomUUID()
    const c = crypto.randomUUID()
    const b = crypto.randomUUID()
    const b2 = crypto.randomUUID()

    createChildren(null, atom(a, "/meta/a"))
    createChildren(null, atom(c, "/meta/c"))
    createBefore(c, atom(b, "/meta/b"))
    createAfter(b, atom(b2, "/meta/b2"))

    expect(getChildren(null).map((entry) => entry.uuid)).toEqual([a, b, b2, c])
    expect(getChildren(null).map((entry) => getPath(entry.uuid))).toEqual(["0", "1", "2", "3"])
  })

  test("createBetween сохраняет стабильный порядок при плотных вставках между теми же соседями", () => {
    const l = crypto.randomUUID()
    const r = crypto.randomUUID()

    createChildren(null, atom(l))
    createChildren(null, atom(r))

    const xs: UUID[] = []
    for (let index = 0; index < 8; index++) {
      const x = crypto.randomUUID()
      xs.push(x)
      createBetween(l, r, atom(x))
    }

    expect(getChildren(null).map((entry) => entry.uuid)).toEqual([l, ...xs, r])
  })

  test("createNode/getNode/getPath выводят path из реальной позиции в дереве", () => {
    const rootA = crypto.randomUUID()
    const rootC = crypto.randomUUID()
    const rootB = crypto.randomUUID()
    const leaf = crypto.randomUUID()

    createNode("0", atom(rootA, "/meta/a"))
    createNode("1", atom(rootC, "/meta/c"))
    createNode("1", atom(rootB, "/meta/b"))
    createNode("1/0", atom(leaf, "/meta/leaf"))

    expect(getPath(rootA)).toBe("0")
    expect(getPath(rootB)).toBe("1")
    expect(getPath(rootC)).toBe("2")
    expect(getNode("1")?.uuid).toBe(rootB)
    expect(getNode("1/0")?.uuid).toBe(leaf)
  })

  test("reserveSibling + attachReserved ставят будущий атом в зарезервированный slot", () => {
    const a = crypto.randomUUID()
    const c = crypto.randomUUID()
    const b = crypto.randomUUID()

    createChildren(null, atom(a))
    createChildren(null, atom(c))
    reserveSibling(b, c, "before")
    attachReserved(atom(b))

    expect(getChildren(null).map((entry) => entry.uuid)).toEqual([a, b, c])
    expect(getAtom(b)?.parent).toBe(null)
    expect(getPath(b)).toBe("1")
  })

  test("reserveByIndexPath резервирует позицию по индексному пути", () => {
    const a = crypto.randomUUID()
    const c = crypto.randomUUID()
    const b = crypto.randomUUID()

    createChildren(null, atom(a))
    createChildren(null, atom(c))
    reserveByIndexPath(b, "1")
    attachReserved(atom(b))

    expect(getChildren(null).map((entry) => entry.uuid)).toEqual([a, b, c])
    expect(getNode("1")?.uuid).toBe(b)
    expect(getNode("2")?.uuid).toBe(c)
  })

  test("повторное использование одного meta остаётся валидным", () => {
    const user1 = crypto.randomUUID()
    const user2 = crypto.randomUUID()

    createChildren(null, atom(user1, "/meta/user"))
    createChildren(null, atom(user2, "/meta/user"))

    expect(getChildren(null).map((entry) => entry.meta)).toEqual(["/meta/user", "/meta/user"])
    expect(getChildren(null).map((entry) => getPath(entry.uuid))).toEqual(["0", "1"])
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
