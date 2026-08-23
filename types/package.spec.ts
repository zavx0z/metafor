import {describe, expect, test} from "bun:test"
import {existsSync, readFileSync} from "node:fs"
import {join} from "node:path"

type TypesPackage = {
  exports: Record<string, string>
}

const definition = JSON.parse(
  readFileSync(join(import.meta.dir, "package.json"), "utf8"),
) as TypesPackage

const compatibilityFacades: Record<string, string> = {
  "./metafor/authoring": 'export * from "shared/protocol/metafor/authoring"\n',
  "./metafor/observation": 'export * from "shared/protocol/metafor/observation"\n',
  "./boundary/initial": 'export * from "shared/protocol/boundary/initial"\n',
  "./boundary/runtime": 'export * from "shared/protocol/boundary/runtime"\n',
  "./boundary/matter": 'export * from "@boundary/types/matter"\n',
  "./boundary/wimp": 'export * from "@boundary/types/wimp"\n',
  "./bulk/browser": 'export * from "shared/protocol/bulk/browser"\n',
  "./bulk/capture": 'export * from "shared/protocol/bulk/capture"\n',
  "./bulk/store": 'export * from "shared/protocol/bulk/store"\n',
}

describe("@metafor/types public exports", () => {
  test("every declared subpath resolves to an existing source file", () => {
    const missing = Object.entries(definition.exports)
      .filter(([, target]) => !existsSync(join(import.meta.dir, target)))
      .map(([subpath, target]) => `${subpath} -> ${target}`)

    expect(missing).toEqual([])
  })

  test("does not own Quantum runtime/domain contracts", () => {
    expect(Object.keys(definition.exports).some((subpath) => subpath.startsWith("./matrix/"))).toBe(false)
    expect(Object.keys(definition.exports).some((subpath) => subpath.startsWith("./energy/"))).toBe(false)
    expect(Object.keys(definition.exports).some((subpath) => subpath.startsWith("./dark/"))).toBe(false)
  })

  test("compatibility exports remain thin re-exports instead of regaining ownership", () => {
    for (const [subpath, expected] of Object.entries(compatibilityFacades)) {
      const target = definition.exports[subpath]
      expect(target).toBeDefined()
      expect(readFileSync(join(import.meta.dir, target!), "utf8")).toBe(expected)
    }
  })

  test("keeps fundamental cross-domain semantic contracts in the package", () => {
    for (const subpath of [
      "./metafor/graph",
      "./metafor/schema",
      "./boundary/atom",
      "./boundary/value",
      "./boundary/topology",
      "./bulk/manifest",
    ]) expect(definition.exports).toHaveProperty(subpath)
  })
})
