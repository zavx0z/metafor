import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {canonicalizeInlineSourceMap, externalizeSourceMap} from "../release/server"

test("development artifact canonicalization removes Bun debug identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-source-map-"))
  const artifact = join(directory, "main.js")
  try {
    const first = await canonicalize(artifact, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    const second = await canonicalize(artifact, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
    expect(second).toEqual(first)
    expect(first.source).toBe("export const ready=true\n")
    expect(first.map).toEqual({version: 3, sources: ["main.ts"], names: [], mappings: "AAAA"})
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("multi-output inline maps keep their location without random debug identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-inline-source-map-"))
  const artifact = join(directory, "entry.js")
  try {
    const first = await canonicalizeInline(artifact, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
    const second = await canonicalizeInline(artifact, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")
    expect(second).toBe(first)
    expect(first).toContain("sourceMappingURL=data:application/json;base64,")
    expect(first).not.toContain("debugId")
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

async function canonicalize(artifact: string, debugId: string) {
  const map = {
    version: 3,
    debugId,
    sources: ["main.ts"],
    names: [],
    mappings: "AAAA",
  }
  const encoded = Buffer.from(JSON.stringify(map)).toString("base64")
  await Bun.write(artifact, [
    "export const ready=true",
    `//# debugId=${debugId}`,
    `//# sourceMappingURL=data:application/json;base64,${encoded}`,
  ].join("\n"))
  await externalizeSourceMap(artifact)
  return {
    source: await Bun.file(artifact).text(),
    map: await Bun.file(`${artifact}.map`).json(),
  }
}

async function canonicalizeInline(artifact: string, debugId: string) {
  const map = {
    version: 3,
    debugId,
    sources: ["entry.ts"],
    names: [],
    mappings: "AAAA",
  }
  const encoded = Buffer.from(JSON.stringify(map)).toString("base64")
  await Bun.write(artifact, [
    "export const ready=true",
    `//# sourceMappingURL=data:application/json;base64,${encoded}`,
    `//# debugId=${debugId}`,
  ].join("\n"))
  await canonicalizeInlineSourceMap(artifact)
  return await Bun.file(artifact).text()
}
