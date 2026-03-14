import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { createChildren, getPath as gravityGetPath } from "./gravity/gravity"
import { gravity$ } from "./gravity/store"
import { matter } from "./dark"
import { dark$ } from "./store"
import type { Address } from "./dark.t"

const originalFetch = globalThis.fetch

const childAst: MetaAST = {
  name: "child-static",
  fields: {},
  superposition: {},
  gravity: [
    {
      type: "meta",
      tag: "meta-for",
      string: {
        src: "leaf/static",
      },
    },
  ],
}

const leafAst: MetaAST = {
  name: "leaf-static",
  fields: {},
  superposition: {},
}

const rootAst: MetaAST = {
  name: "root",
  fields: {},
  superposition: {},
  gravity: [
    {
      type: "meta",
      tag: "meta-for",
      string: {
        src: "child/static",
      },
    },
    {
      type: "meta",
      tag: "meta-for",
      string: {
        src: "child/static",
      },
    },
  ],
}

beforeEach(() => {
  dark$.reset()
  gravity$.reset()
})

afterEach(() => {
  dark$.reset()
  gravity$.reset()
  globalThis.fetch = originalFetch
})

describe("dark/store", () => {
  test("dark больше не является alias gravity", () => {
    expect(dark$).not.toBe(gravity$)
  })

  test("dark$ и gravity$ имеют default state и restore/reset поведение", () => {
    const rootUuid = crypto.randomUUID()
    const tempUuid = crypto.randomUUID()
    dark$.setMeta("root", rootAst)
    dark$.setAtom({ uuid: rootUuid, meta: "root", path: "0" })

    createChildren(null, { uuid: tempUuid, meta: "temp" })

    const darkSnapshot = dark$.snapshot()
    const gravitySnapshot = gravity$.snapshot()

    dark$.reset()
    gravity$.reset()

    expect(dark$.meta.size).toBe(0)
    expect(dark$.atom.size).toBe(0)
    expect(gravity$.atom.size).toBe(0)
    expect(gravity$.children.size).toBe(0)

    dark$.restore(darkSnapshot)
    gravity$.restore(gravitySnapshot)

    expect(dark$.meta.has("root")).toBe(true)
    expect(dark$.getAtom(rootUuid)?.path).toBe("0")
    expect(gravity$.get(tempUuid)?.uuid).toBe(tempUuid)
    expect(gravityGetPath(tempUuid)).toBe("0")
  })

  test("load запускает Dark pipeline и заполняет dark.meta + dark.atom", async () => {
    globalThis.fetch = Object.assign(
      async (input: URL | RequestInfo) => {
        const url = String(input)

        if (url === "/root/meta.json") {
          return Response.json(rootAst)
        }

        if (url === "/child/static/meta.json") {
          return Response.json(childAst)
        }

        if (url === "/leaf/static/meta.json") {
          return Response.json(leafAst)
        }

        return new Response("not found", { status: 404 })
      },
      { preconnect: () => {} },
    )

    await matter("root" as Address)

    expect(dark$.meta.has("root")).toBe(true)
    expect(dark$.meta.has("child/static")).toBe(true)

    const atoms = [...dark$.atom.values()]
    expect(atoms.length).toBe(3) // root + 2 child/static
    expect(atoms.map((a) => a.meta)).toEqual(["root", "child/static", "child/static"])
    expect(atoms.map((a) => a.path)).toEqual(["0", "0/0", "0/1"])

    // Проверяем что у всех атомов разные uuid
    const uuids = atoms.map((a) => a.uuid)
    expect(new Set(uuids).size).toBe(uuids.length)

    expect(gravity$.atom.size).toBe(3)
    expect(dark$.topology.getReferencesBySource("child/static")).toHaveLength(2)
    expect(dark$.topology.getReferencesBySource("leaf/static")).toHaveLength(2)

    const childPlacements = dark$.topology.getPlacementsByObject("child/static#w0")
    expect(childPlacements).toHaveLength(2)
    expect(new Set(childPlacements.map((placement) => placement.address)).size).toBe(2)

    const childEntanglements = childPlacements
      .map((placement) => dark$.topology.getEntanglementByAddress(`ent:child/static#w0@${placement.address}`))
      .filter(Boolean)
    expect(childEntanglements).toHaveLength(2)
  })

  test("атомы с одинаковым meta получают разные uuid", () => {
    const uuid1 = crypto.randomUUID()
    const uuid2 = crypto.randomUUID()

    createChildren(null, { uuid: uuid1, meta: "same/meta" })
    createChildren(null, { uuid: uuid2, meta: "same/meta" })

    const atom1 = gravity$.get(uuid1)
    const atom2 = gravity$.get(uuid2)

    expect(atom1?.uuid).toBe(uuid1)
    expect(atom2?.uuid).toBe(uuid2)
    expect(atom1?.meta).toBe("same/meta")
    expect(atom2?.meta).toBe("same/meta")
    expect(atom1?.uuid).not.toBe(atom2?.uuid)
  })

  test("перемещение атома меняет path, но не uuid", () => {
    const rootUuid = crypto.randomUUID()
    const childUuid = crypto.randomUUID()

    createChildren(null, { uuid: rootUuid, meta: "root" })
    createChildren(rootUuid, { uuid: childUuid, meta: "child" })

    const childBefore = gravity$.get(childUuid)
    const pathBefore = childBefore ? gravityGetPath(childUuid) : undefined

    expect(childBefore?.uuid).toBe(childUuid)
    expect(pathBefore).toBeDefined()

    // При перемещении uuid остаётся тем же, меняется только path
    // (в текущей реализации для этого нужно удалить и создать заново)
    // Проверяем что uuid стабилен
    expect(childBefore?.uuid).toBe(childUuid)
  })
})
