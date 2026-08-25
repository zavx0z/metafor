import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {externalizeSourceMap} from "../release/server"

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
