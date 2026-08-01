import {describe, expect, test} from "bun:test"
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  isImportDeclaration,
  isStringLiteral,
} from "typescript"

const modules = Object.freeze([
  "ForceStories.ts",
  "PhotonForceStory.ts",
  "ForceStoriesLab.ts",
  "fixture/PhotonStoryFixture.ts",
  "ForceStoryLabAdapter.ts",
])

const importsOf = async (path: string): Promise<readonly string[]> => {
  const source = await Bun.file(new URL(`./${path}`, import.meta.url)).text()
  const file = createSourceFile(
    path,
    source,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  )
  return file.statements.flatMap((statement) => {
    if (!isImportDeclaration(statement)) return []
    return isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : []
  })
}

const isDeepBulkImport = (specifier: string): boolean =>
  specifier.startsWith(".") && /(^|\/)bulk\//.test(specifier)

describe("Force Story private dependency boundary", () => {
  test("routes Bulk wiring through the public visual lifecycle", async () => {
    const importsByModule = new Map(await Promise.all(modules.map(async (path) =>
      [path, await importsOf(path)] as const
    )))
    const deepBulkByModule = [...importsByModule].map(([path, imports]) => ({
      imports: imports.filter(isDeepBulkImport).sort(),
      path,
    })).filter((entry) => entry.imports.length > 0)

    expect(deepBulkByModule).toEqual([])
    expect(importsByModule.get("ForceStoryLabAdapter.ts"))
      .toContain("bulk/visual")
  })

  test("keeps catalog, Photon scenario and UI behind the adapter", async () => {
    const catalogImports = await importsOf("ForceStories.ts")
    const photonImports = await importsOf("PhotonForceStory.ts")
    const uiImports = await importsOf("ForceStoriesLab.ts")

    expect(catalogImports).toContain("./PhotonForceStory.ts")
    expect(catalogImports).not.toContain("./ForceStoryLabAdapter.ts")
    expect(photonImports).toEqual(["./fixture/PhotonStoryFixture.ts"])
    expect(uiImports).toContain("./ForceStories.ts")
    expect(uiImports).toContain("./ForceStoryLabAdapter.ts")
    expect(uiImports.some(isDeepBulkImport)).toBe(false)
  })
})
