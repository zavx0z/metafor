import {describe, expect, test} from "bun:test"
import {dirname, isAbsolute, join, relative, resolve} from "node:path"
import {parseSync} from "oxc-parser"

// Remove entries as offline checkpoint tooling leaves Dark. This allowlist must
// become empty and must never grow.
const LEGACY_CHECKPOINT_BOUNDARY_IMPORTS = Object.freeze([
  "checkpoint/capture.ts -> ../../boundary/graph.ts",
  "checkpoint/capture.ts -> boundary/sqlite",
  "checkpoint/dissolve-candidate.ts -> ../../boundary/dissolve-candidate-staging.ts",
  "checkpoint/dissolve-candidate.ts -> ../../boundary/dissolve-mass-evidence.ts",
  "checkpoint/dissolve-candidate.ts -> ../../boundary/dissolve-staging.ts",
  "checkpoint/dissolve-candidate.ts -> boundary/sqlite",
  "checkpoint/dissolve-promotion.ts -> ../../boundary/dissolve-candidate-staging.ts",
  "checkpoint/dissolve-promotion.ts -> ../../boundary/dissolve.ts",
])

const CREATE_METAFOR_LIBRARY_EXPORTS = Object.freeze([
  "buildMetaPackageTemplate",
  "discardSourceCandidates",
  "materializeMetaCreatePatch",
  "planMetaDeclarationPatch",
  "planMetaMatterPatch",
  "prepareSourceCandidates",
  "readSourceRevision",
  "readSourceSnapshot",
  "recoverAndPublishSourceCandidates",
])

const importSpecifiers = (path: string, source: string): string[] => {
  const module = parseSync(path, source).module
  return [
    ...module.staticImports.map(({moduleRequest}) => moduleRequest.value),
    ...module.staticExports.flatMap(({entries}) =>
      entries.flatMap(({moduleRequest}) => moduleRequest === null ? [] : [moduleRequest.value])
    ),
    ...module.dynamicImports.map(({moduleRequest}) => source.slice(moduleRequest.start + 1, moduleRequest.end - 1)),
  ]
}

const isBoundaryImport = (
  importer: string,
  specifier: string,
  boundaryRoot: string,
): boolean => {
  if (specifier === "boundary" || specifier.startsWith("boundary/")) return true
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) return false
  const target = resolve(dirname(importer), specifier)
  const fromBoundary = relative(boundaryRoot, target)
  return fromBoundary === "" ||
    (!fromBoundary.startsWith("..") && !isAbsolute(fromBoundary))
}

const isCreateMetaforImplementationImport = (
  importer: string,
  specifier: string,
  createMetaforRoot: string,
): boolean => {
  if (specifier === "create-metafor/src" || specifier.startsWith("create-metafor/src/")) return true
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) return false
  const target = resolve(dirname(importer), specifier)
  const fromImplementation = relative(resolve(createMetaforRoot, "src"), target)
  return fromImplementation === "" ||
    (!fromImplementation.startsWith("..") && !isAbsolute(fromImplementation))
}

describe("Dark package boundary", () => {
  test("resolves the exact side-effect-free Create MetaFor library facade", async () => {
    const library = await import("create-metafor/library")
    expect(Object.keys(library).toSorted()).toEqual([...CREATE_METAFOR_LIBRARY_EXPORTS])

    const createMetaforPackage = await Bun.file(resolve(import.meta.dir, "../../create-metafor/package.json")).json() as {
      main?: unknown
      bin?: Record<string, unknown>
      exports?: Record<string, unknown>
    }
    const darkPackage = await Bun.file(resolve(import.meta.dir, "package.json")).json() as {
      dependencies?: Record<string, unknown>
    }
    expect(createMetaforPackage.exports?.["./library"]).toBe("./library.ts")
    expect(createMetaforPackage.main).toBe("dist/cli.js")
    expect(createMetaforPackage.bin?.["create-metafor"]).toBe("dist/cli.js")
    expect(darkPackage.dependencies?.["create-metafor"]).toBe("workspace:*")
  })

  test("keeps production Boundary imports limited to the frozen offline allowlist", async () => {
    const darkRoot = import.meta.dir
    const boundaryRoot = resolve(darkRoot, "../boundary")
    const imports: string[] = []
    for await (const path of new Bun.Glob("**/*.ts").scan({cwd: darkRoot})) {
      if (path.endsWith(".spec.ts") || path.endsWith(".test.ts")) continue
      const importer = join(darkRoot, path)
      const source = await Bun.file(importer).text()
      for (const specifier of importSpecifiers(path, source)) {
        if (isBoundaryImport(importer, specifier, boundaryRoot)) {
          imports.push(`${path} -> ${specifier}`)
        }
      }
    }

    expect(imports.toSorted()).toEqual(LEGACY_CHECKPOINT_BOUNDARY_IMPORTS.toSorted())
  })

  test("does not import Create MetaFor implementation files from production Dark", async () => {
    const darkRoot = import.meta.dir
    const createMetaforRoot = resolve(darkRoot, "../../create-metafor")
    const imports: string[] = []
    for await (const path of new Bun.Glob("**/*.ts").scan({cwd: darkRoot})) {
      if (path.endsWith(".spec.ts") || path.endsWith(".test.ts")) continue
      const importer = join(darkRoot, path)
      const source = await Bun.file(importer).text()
      for (const specifier of importSpecifiers(path, source)) {
        if (isCreateMetaforImplementationImport(importer, specifier, createMetaforRoot)) {
          imports.push(`${path} -> ${specifier}`)
        }
      }
    }

    expect(imports).toEqual([])
  })
})
