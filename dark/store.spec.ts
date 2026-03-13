import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { createChildren } from "./gravity/pipeline"
import { gravity$ } from "./gravity/store"
import { load } from "./load"
import { dark$ } from "./store"

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
  test("loader package surface идёт через dedicated load module", async () => {
    const indexModule = await import("./index")
    const loadModule = await import("./load")

    expect(indexModule.load).toBe(loadModule.load)
    expect(indexModule.loadMetaAST).toBe(loadModule.loadMetaAST)
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
    globalThis.fetch = async (input) => {
      const url = String(input)

      if (url === "/root/meta.json") {
        return Response.json(rootAst)
      }

      if (url === "/child/static/meta.json") {
        return Response.json(childAst)
      }

      return new Response("not found", { status: 404 })
    }

    await load("root")

    expect(dark$.meta.has("root")).toBe(true)
    expect(dark$.meta.has("child/static")).toBe(true)
    expect([...dark$.atom.values()].map((entry) => entry.meta)).toEqual(["root", "child/static", "child/static"])
    expect([...dark$.atom.values()].map((entry) => entry.path)).toEqual(["0", "0/0", "0/1"])
    expect(gravity$.atom.size).toBe(3)
  })
})
