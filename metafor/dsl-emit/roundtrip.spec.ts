import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { parseDslModuleToDb } from "@metafor/dsl-parse"
import { emitDslModuleFromDb, formatTypeScriptSource } from "./index.ts"

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
      metaFiles.push(entryPath)
    }
  }

  return metaFiles.sort()
}

const describeMismatch = (expected: string, actual: string) => {
  const limit = Math.max(expected.length, actual.length)
  let line = 1
  let column = 1

  for (let index = 0; index < limit; index += 1) {
    const expectedChar = expected[index]
    const actualChar = actual[index]

    if (expectedChar !== actualChar) {
      const expectedSnippet = JSON.stringify(expected.slice(index, index + 40))
      const actualSnippet = JSON.stringify(actual.slice(index, index + 40))
      return `first diff at ${line}:${column}; expected ${expectedSnippet}; actual ${actualSnippet}`
    }

    if (expectedChar === "\n") {
      line += 1
      column = 1
      continue
    }

    column += 1
  }

  return "byte mismatch"
}

describe("dsl authoring round-trip", () => {
  test("matches the formatted github/zavx0z corpus byte-for-byte", async () => {
    const corpusRoot = join(process.cwd(), "github", "zavx0z")
    const metaFiles = await collectMetaFiles(corpusRoot)
    const db = new Database(":memory:")
    const formattedInputs = new Map<string, string>()

    try {
      for (const metaPath of metaFiles) {
        const moduleKey = relative(process.cwd(), metaPath)
        const sourceText = await readFile(metaPath, "utf8")
        const formattedInput = await formatTypeScriptSource(sourceText, metaPath)

        formattedInputs.set(moduleKey, formattedInput)
        parseDslModuleToDb({
          db,
          sourceText: formattedInput,
          moduleKey,
          sourcePath: moduleKey,
          filename: metaPath,
        })
      }

      const failures: string[] = []

      for (const metaPath of metaFiles) {
        const moduleKey = relative(process.cwd(), metaPath)
        const expected = formattedInputs.get(moduleKey)
        if (!expected) {
          failures.push(`${moduleKey}: missing formatted input snapshot`)
          continue
        }

        const emitted = await emitDslModuleFromDb({
          db,
          moduleKey,
          filepath: metaPath,
        })
        const formattedOutput = await formatTypeScriptSource(emitted, metaPath)

        if (expected !== formattedOutput) {
          failures.push(`${moduleKey}: ${describeMismatch(expected, formattedOutput)}`)
        }
      }

      expect(failures).toEqual([])
    } finally {
      db.close()
    }
  })
})
