import { describe, expect, test } from "bun:test"
import { access, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import type { MetaDSLLike } from "../ast.t"
import { convertMetaDSLToMetaAST } from "../index.ts"

const IGNORED_ROOTS = ["metafor/template/", "metafor/create-metafor/templates/"]
const DSL_SOURCE_PATH = join(process.cwd(), "metafor/dsl/index.ts")

const collectMetaFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true })
  const metaFiles: string[] = []

  for (const entry of entries) {
    const entryPath = join(root, entry.name)

    if (entry.isDirectory()) {
      metaFiles.push(...(await collectMetaFiles(entryPath)))
      continue
    }

    if (entry.isFile() && entry.name === "meta.ts") {
      const relativePath = entryPath.slice(`${process.cwd()}/`.length)
      if (IGNORED_ROOTS.some((prefix) => relativePath.startsWith(prefix))) continue
      metaFiles.push(entryPath)
    }
  }

  return metaFiles
}

const rewriteMetaSourceForTest = (sourceText: string): string => {
  return sourceText.replaceAll(/(["'])@metafor\/dsl\1/g, JSON.stringify(DSL_SOURCE_PATH))
}

const importMetaModuleForTest = async (metaPath: string, sourceText: string, cacheKey: number): Promise<MetaDSLLike> => {
  const tempPath = join(dirname(metaPath), `.repo-meta.${process.pid}.${cacheKey}.ts`)

  try {
    await writeFile(tempPath, rewriteMetaSourceForTest(sourceText), "utf8")
    const moduleUrl = `${pathToFileURL(tempPath).href}?t=${cacheKey}`
    const module = (await import(moduleUrl)) as { default: MetaDSLLike }
    return module.default
  } finally {
    await rm(tempPath, { force: true })
  }
}

describe("repository meta sources", () => {
  test("все repo meta.ts вне template сериализуются под strict matter contract", async () => {
    const failures: string[] = []
    const metaFiles = await collectMetaFiles(process.cwd())
    let counter = 0

    for (const metaPath of metaFiles) {
      try {
        await access(metaPath)
      } catch {
        continue
      }

      try {
        const sourceText = await readFile(metaPath, "utf8")
        const meta = await importMetaModuleForTest(metaPath, sourceText, counter++)
        convertMetaDSLToMetaAST(meta, sourceText)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const relativePath = metaPath.slice(`${process.cwd()}/`.length)
        failures.push(`${relativePath}: ${message}`)
      }
    }

    expect(failures).toEqual([])
  })
})
