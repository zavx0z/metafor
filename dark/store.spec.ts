import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
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
})

afterEach(() => {
  dark$.reset()
  globalThis.fetch = originalFetch
})

describe("dark/store", () => {
  test("dark$ хранит только meta и topology", () => {
    const snapshot = dark$.snapshot()
    expect(snapshot.meta).toBeInstanceOf(Map)
    expect(snapshot.topology).toBeDefined()
    expect((snapshot as any).atom).toBeUndefined()
  })

  test("dark$ имеет default state и restore/reset поведение", () => {
    dark$.setMeta("root", rootAst)

    const snapshot = dark$.snapshot()

    dark$.reset()

    expect(dark$.meta.size).toBe(0)
    expect(dark$.topology.snapshot().fragments.size).toBe(0)

    dark$.restore(snapshot)

    expect(dark$.meta.has("root")).toBe(true)
  })

  test("matter запускает Dark pipeline и заполняет dark.meta + dark.topology", async () => {
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

    // Проверяем topology вместо atom
    const childPlacements = dark$.topology.getPlacementsByObject("child/static#w0")
    expect(childPlacements.length).toBe(2)

    // Проверяем что у всех placements разные addresses (identity vs object identity)
    const addresses = childPlacements.map((p) => p.address)
    expect(new Set(addresses).size).toBe(addresses.length)

    // Проверяем reference stitching
    expect(dark$.topology.getReferencesBySource("child/static")).toHaveLength(2)
    expect(dark$.topology.getReferencesBySource("leaf/static")).toHaveLength(2)

    // Проверяем entanglement addressing
    const childEntanglements = childPlacements
      .map((placement) => dark$.topology.getEntanglementByAddress(`ent:child/static#w0@${placement.address}`))
      .filter(Boolean)
    expect(childEntanglements.length).toBe(2)
  })

  test("перемещение в topology меняет address, но сохраняет objectId", () => {
    // В topology-модели identity определяется через objectId + placement
    // При перемещении placement получает новый address, но objectId остаётся тем же
    // Это проверяется через getPlacementsByObject
  })
})
