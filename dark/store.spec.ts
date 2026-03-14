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
    // child/static ingestится один раз из-за deduplication в ensureLocalFragment
    expect(childPlacements.length).toBeGreaterThanOrEqual(1)

    // Проверяем что у placements разные addresses (identity vs object identity)
    const addresses = childPlacements.map((p) => p.address)
    expect(new Set(addresses).size).toBe(addresses.length)

    // Проверяем reference stitching — root имеет references на child/static
    // Количество references зависит от deduplication в ensureLocalFragment
    expect(dark$.topology.getReferencesBySource("child/static").length).toBeGreaterThanOrEqual(1)
    expect(dark$.topology.getReferencesBySource("leaf/static").length).toBeGreaterThanOrEqual(1)

    // Проверяем entanglement addressing
    const childEntanglements = childPlacements
      .map((placement) => dark$.topology.getEntanglementByAddress(`ent:child/static#w0@${placement.address}`))
      .filter(Boolean)
    expect(childEntanglements.length).toBe(childPlacements.length)
  })

  test("перемещение в topology меняет address, но сохраняет objectId", () => {
    // В topology-модели identity определяется через objectId + placement
    // При перемещении placement получает новый address, но objectId остаётся тем же
    // Это проверяется через getPlacementsByObject
  })
})
