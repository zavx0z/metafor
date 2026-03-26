import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { parseDslModuleToDb } from "@metafor/dsl-parse"
import { emitDslModuleFromDb, formatTypeScriptSource } from "@metafor/dsl-emit"

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
  test("matches the formatted github/zavx0z corpus byte-for-byte and saves per-module artifacts", async () => {
    const corpusRoot = join(process.cwd(), "github", "zavx0z")
    const artifactsRoot = join(process.cwd(), "tests", "tmp", "dsl-roundtrip")
    const metaFiles = await collectMetaFiles(corpusRoot)
    const failures: string[] = []

    await rm(artifactsRoot, { recursive: true, force: true })
    await mkdir(artifactsRoot, { recursive: true })

    for (const metaPath of metaFiles) {
      const modulePath = relative(process.cwd(), metaPath)
      const artifactBase = join(artifactsRoot, modulePath.replace(/\.ts$/, ""))
      const dbPath = join(artifactBase, "authoring.sqlite")
      const inputPath = join(artifactBase, "formatted-input.ts")
      const outputPath = join(artifactBase, "emitted.ts")

      await mkdir(dirname(dbPath), { recursive: true })

      const db = new Database(dbPath)

      try {
        const sourceText = await readFile(metaPath, "utf8")
        const formattedInput = await formatTypeScriptSource(sourceText, metaPath)
        await writeFile(inputPath, formattedInput, "utf8")

        parseDslModuleToDb({
          db,
          sourceText: formattedInput,
          sourcePath: modulePath,
          filename: metaPath,
        })

        const emitted = await emitDslModuleFromDb({
          db,
          filepath: metaPath,
        })
        const formattedOutput = await formatTypeScriptSource(emitted, metaPath)
        await writeFile(outputPath, formattedOutput, "utf8")

        if (formattedInput !== formattedOutput) {
          failures.push(`${modulePath}: ${describeMismatch(formattedInput, formattedOutput)}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`${modulePath}: ${message}`)
      } finally {
        db.close()
      }
    }

    expect(failures).toEqual([])
  }, 20000)
})
