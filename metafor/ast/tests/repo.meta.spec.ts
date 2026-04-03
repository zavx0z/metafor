import { describe, expect, test } from "bun:test"
import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { MetaDSLLike } from "../ast.t"
import { convertMetaDSLToMetaAST } from "../index.ts"

const IGNORED_ROOTS = ["metafor/template/", "metafor/create-metafor/templates/"]

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

const importMetaModuleForTest = async (metaPath: string, cacheKey: number): Promise<MetaDSLLike> => {
  const moduleUrl = `${pathToFileURL(metaPath).href}?t=${cacheKey}`
  const module = (await import(moduleUrl)) as { default: MetaDSLLike }
  return module.default
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
        const meta = await importMetaModuleForTest(metaPath, counter++)
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
