import { describe, expect, test } from "bun:test"
import { access, readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
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
        const moduleUrl = `${pathToFileURL(metaPath).href}?t=${counter++}`
        const module = await import(moduleUrl)
        convertMetaDSLToMetaAST(module.default as any, sourceText)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const relativePath = metaPath.slice(`${process.cwd()}/`.length)
        failures.push(`${relativePath}: ${message}`)
      }
    }

    expect(failures).toEqual([])
  })
})
