import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { load } from "./dark"
import { gravity$ } from "./gravity/store"
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
  test("dark больше не является alias gravity", () => {
    expect(dark$).not.toBe(gravity$)
  })

  test("dark store владеет собственными meta и atom", () => {
    dark$.setMeta("root", rootAst)

    gravity$.createChildren(null, { address: "temp", meta: "temp" })

    expect(dark$.meta.has("root")).toBe(true)
    expect(dark$.atom.size).toBe(0)
    expect(gravity$.atom.size).toBe(1)
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
  })
})
