import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {canonicalizeInlineSourceMap, externalizeSourceMap, browserPackageSourceMapUrl, parseBrowserPackageSourceMapUrl} from "../release/server"
import {parseBrowserPackageArtifactUrl} from "../release/shared/artifact-url"

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

test("inline canonicalization helper preserves mappings without random debug identity", async () => {
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

test("source map companions address root, public export and generated chunk without creating cache slots", () => {
  for (const artifact of [".", "./component", "./.cosmos/chunk/shared.js"] as const) {
    const url = new URL(browserPackageSourceMapUrl("@internal/visual", "main", "1.0.1", artifact), "https://maps.test")
    expect(parseBrowserPackageSourceMapUrl(url)).toEqual({
      name: "@internal/visual", env: "main", version: "1.0.1",
      ...(artifact === "." ? {} : {artifact}),
    })
    expect(parseBrowserPackageArtifactUrl(url)).toBeNull()
  }
})

test("externalization accepts a trailing Bun debug marker after the inline map", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-trailing-source-map-"))
  const artifact = join(directory, "entry.js")
  try {
    const map = {version: 3, sources: ["entry.ts"], sourcesContent: ["export const value = 1"], names: [], mappings: "AAAA"}
    await Bun.write(artifact, `export const value=1\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString("base64")}\n//# debugId=AAAAAAAA\n`)
    await externalizeSourceMap(artifact)
    expect(await Bun.file(artifact).text()).toBe("export const value=1\n")
    expect(await Bun.file(`${artifact}.map`).json()).toEqual(map)
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
