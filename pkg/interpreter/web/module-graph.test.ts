import {describe, expect, test} from "bun:test"
import {canonicalModulePath, localImportsForSource, resolveLocalImportCandidates} from "./module-graph.ts"

describe("module graph import parsing", () => {
  test("finds static and dynamic relative imports", () => {
    const imports = localImportsForSource("dark/server.spec.ts", `
      import {test} from "bun:test"
      import type {OnlyType} from "./types.ts"
      import helper from "../fixture/helper"
      export {x} from "./x.ts"
      export type {Ignored} from "./ignored.ts"
      await import("./server.ts")
    `)
    expect(imports.map((item) => item.specifier)).toEqual(["../fixture/helper", "./x.ts", "./server.ts"])
  })

  test("resolves extensionless local imports to TypeScript candidates", () => {
    expect(resolveLocalImportCandidates("dark/server.spec.ts", "./server").slice(0, 3)).toEqual([
      "dark/server",
      "dark/server.ts",
      "dark/server.tsx",
    ])
  })

  test("keeps root-relative imports relative instead of absolute", () => {
    expect(resolveLocalImportCandidates("metafor.ts", "./matter").slice(0, 2)).toEqual([
      "matter",
      "matter.ts",
    ])
  })

  test("treats yaml imports as direct source modules", () => {
    expect(resolveLocalImportCandidates("dark/server.ts", "./settings.yml")).toEqual(["dark/settings.yml"])
  })

  test("normalizes Bun source-map r prefix for matching", () => {
    expect(canonicalModulePath("r/dark/server.ts")).toBe("dark/server.ts")
  })
})
