import {describe, expect, test} from "bun:test"
import {existsSync, readFileSync, readdirSync} from "node:fs"
import {join} from "node:path"

type TypesPackage = {
  exports: Record<string, string>
  dependencies?: Record<string, string>
}

const definition = JSON.parse(
  readFileSync(join(import.meta.dir, "package.json"), "utf8"),
) as TypesPackage

const expectedExports = [
  "./metafor/fields",
  "./metafor/mass",
  "./metafor/superposition",
  "./metafor/action",
  "./metafor/process",
  "./metafor/finally",
  "./metafor/reactions",
  "./metafor/matter",
  "./metafor/schema",
  "./metafor/graph",
  "./boundary/atom",
  "./boundary/value",
  "./boundary/topology",
  "./bulk/manifest",
].toSorted()

describe("@metafor/types ownership", () => {
  test("exports exactly the fundamental semantic contracts", () => {
    expect(Object.keys(definition.exports).toSorted()).toEqual(expectedExports)
  })

  test("every declared subpath resolves to an existing source file", () => {
    const missing = Object.entries(definition.exports)
      .filter(([, target]) => !existsSync(join(import.meta.dir, target)))
      .map(([subpath, target]) => `${subpath} -> ${target}`)

    expect(missing).toEqual([])
  })

  test("does not depend on protocol or domain-owner packages", () => {
    expect(definition.dependencies).toBeUndefined()
  })

  test("contains no compatibility facade files", () => {
    expect(readdirSync(join(import.meta.dir, "metafor")).toSorted()).toEqual([
      "action.ts",
      "fields.ts",
      "finally.ts",
      "graph.ts",
      "mass.ts",
      "matter.ts",
      "process.ts",
      "reactions.ts",
      "schema.ts",
      "superposition.ts",
    ])
    expect(readdirSync(join(import.meta.dir, "boundary")).toSorted()).toEqual([
      "atom.ts",
      "topology.ts",
      "value.ts",
    ])
    expect(readdirSync(join(import.meta.dir, "bulk")).toSorted()).toEqual([
      "manifest.ts",
    ])
  })
})
