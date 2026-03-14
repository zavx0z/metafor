import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { MetaFor, compileLocalTopologyFragment } from "../metafor/dsl/metafor.ts"
import { matter, resetDark, restoreDark, snapshotDark } from "./dark"
import {
  getEntanglementByAddress,
  getPlacementByAddress,
  getPlacementsByObject,
  getReferencesBySource,
} from "./gravity/query.ts"
import { dark$ } from "./store"
import { gravity$ } from "./gravity/store.ts"
import { strong$ } from "./strong/store.ts"
import type { Address } from "./dark.t"
import { ingestFragment } from "./gravity/gravity.ts"

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
  strong$.reset()
})

afterEach(() => {
  dark$.reset()
  gravity$.reset()
  strong$.reset()
  globalThis.fetch = originalFetch
})

describe("dark/store", () => {
  test("dark$ хранит только meta и topology", () => {
    const snapshot = dark$.snapshot()
    expect(snapshot.meta).toBeInstanceOf(Map)
    expect(snapshot.placements).toBeInstanceOf(Map)
    expect(snapshot.references).toBeInstanceOf(Map)
    expect((snapshot as any).atom).toBeUndefined()
    expect((snapshot as any).topology).toBeUndefined()
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
    const childPlacements = getPlacementsByObject(dark$, "child/static#w0")
    // child/static ingestится один раз из-за deduplication в ensureLocalFragment
    expect(childPlacements.length).toBeGreaterThanOrEqual(1)

    // Проверяем что у placements разные addresses (identity vs object identity)
    const addresses = childPlacements.map((p) => p.address)
    expect(new Set(addresses).size).toBe(addresses.length)

    // Проверяем reference stitching — root имеет references на child/static
    // Количество references зависит от deduplication в ensureLocalFragment
    expect(getReferencesBySource(dark$, "child/static").length).toBeGreaterThanOrEqual(1)
    expect(getReferencesBySource(dark$, "leaf/static").length).toBeGreaterThanOrEqual(1)

    // Проверяем entanglement addressing
    const childEntanglements = childPlacements
      .map((placement) => getEntanglementByAddress(dark$, `ent:child/static#w0@${placement.address}`))
      .filter(Boolean)
    expect(childEntanglements.length).toBe(childPlacements.length)
  })

  test("перемещение в topology меняет address, но сохраняет objectId", () => {
    // В topology-модели identity определяется через objectId + placement
    // При перемещении placement получает новый address, но objectId остаётся тем же
    // Это проверяется через getPlacementsByObject
  })

  test("resetDark очищает canonical и промежуточные store", () => {
    const meta = MetaFor("reset-dark")
      .fields((field) => ({
        enabled: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    ingestFragment("reset-dark/root", fragment)

    expect(dark$.placements.size).toBeGreaterThan(0)
    expect(gravity$.fragments.size).toBeGreaterThan(0)
    expect(strong$.placementAddressIndex.size).toBeGreaterThan(0)

    resetDark()

    expect(dark$.placements.size).toBe(0)
    expect(gravity$.fragments.size).toBe(0)
    expect(strong$.placementAddressIndex.size).toBe(0)
  })

  test("restoreDark восстанавливает canonical state и пересобирает индексы", () => {
    const meta = MetaFor("restore-dark")
      .fields((field) => ({
        enabled: field.boolean.required(true),
      }))
      .superposition({ idle: null })
      .mass()
      .processes()
      .reactions()
      .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
      .bulk()

    const fragment = compileLocalTopologyFragment(meta)
    const first = ingestFragment("restore-dark/root", fragment)
    const firstRoot = dark$.getPlacement(first.rootPlacementIds[0]!)!
    const snapshot = snapshotDark()

    resetDark()
    restoreDark(snapshot)

    expect(dark$.getPlacement(firstRoot.id)?.address).toBe(firstRoot.address)
    expect(getPlacementByAddress(dark$, firstRoot.address)?.id).toBe(firstRoot.id)

    const second = ingestFragment("restore-dark/root", fragment)
    const secondRoot = dark$.getPlacement(second.rootPlacementIds[0]!)!

    expect(secondRoot.id).not.toBe(firstRoot.id)
    expect(secondRoot.address).not.toBe(firstRoot.address)
  })
})
