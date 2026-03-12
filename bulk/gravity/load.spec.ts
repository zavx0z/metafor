import { afterEach, describe, expect, test } from "bun:test"
import type { MonadJson } from "@metafor/ast"
import { loadBulkGraph, loadDSL } from "./load"

const ast: MonadJson = {
  name: "git",
  fields: {},
  superposition: {},
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("bulk/gravity/load", () => {
  test("loads dark-owned graph contract for bulk", async () => {
    const fetchCalls: string[] = []

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      fetchCalls.push(url)

      return new Response(JSON.stringify(ast), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })
    }) as typeof fetch

    const projection = await loadBulkGraph("/schemas/git")

    expect(fetchCalls).toEqual(["/schemas/git/meta.json"])
    expect(projection.consumer).toBe("bulk")
    expect(projection.ast).toEqual(ast)
    expect(projection.graph.getNode(["fields"])?.key).toBe("fields")
    expect(await loadDSL("/schemas/git")).toEqual(ast)
    expect(fetchCalls).toEqual(["/schemas/git/meta.json", "/schemas/git/meta.json"])
  })
})
