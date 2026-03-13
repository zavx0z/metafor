import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { createChildren } from "./gravity/gravity"
import { gravity$ } from "./gravity/store"
import { load } from "./dark"
import { dark$ } from "./store"
import type { Address } from "./dark.t.js"

const originalFetch = globalThis.fetch

const childAst: MetaAST = {
  name: "child-static",
  fields: {},
  superposition: {},
}

const rootAst: MetaAST = {
  name: "root",
  fields: {},
  superposition: {},
  gravity: [
    {
      type: "el",
      tag: "section",
      child: [
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
  test("dark/index экспортирует Dark orchestrator и отдельный loader", async () => {
    const indexModule = await import("./index")
    const darkModule = await import("./dark")
    const loadModule = await import("./load")

    expect(indexModule.load).toBe(darkModule.load)
    expect(indexModule.loadMetaAST).toBe(loadModule.loadMetaAST)
    expect("load" in loadModule).toBe(false)
  })

  test("dark больше не является alias gravity", () => {
    expect(dark$).not.toBe(gravity$)
  })

  test("dark$ и gravity$ имеют default state и restore/reset поведение", () => {
    dark$.setMeta("root", rootAst)
    dark$.setAtom({ address: "atom/root", meta: "root", path: "0" })

    createChildren(null, { address: "temp", meta: "temp" })

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
    expect(dark$.getNode("0")?.address).toBe("atom/root")
    expect(gravity$.get("temp")?.address).toBe("temp")
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

        return new Response("not found", { status: 404 })
      },
      { preconnect: () => {} },
    )

    await load("root" as Address)

    expect(dark$.meta.has("root")).toBe(true)
    expect(dark$.meta.has("child/static")).toBe(true)
    expect([...dark$.atom.values()].map((entry) => entry.meta)).toEqual(["root", "child/static", "child/static"])
    expect([...dark$.atom.values()].map((entry) => entry.path)).toEqual(["0", "0/0", "0/1"])
    expect(gravity$.atom.size).toBe(3)
  })
})
