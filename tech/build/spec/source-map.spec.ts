import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"
import {pathToFileURL} from "node:url"
import {canonicalExecutableSource, externalizeSourceMap} from "../source-map"

const marker = "//# sourceMappingURL=data:application/json;base64,"
const emptyMap = {version: 3, sources: [], sourcesContent: [], names: [], mappings: ""}
const inline = (code: string, map: unknown = emptyMap) => `${code}\n${marker}${Buffer.from(JSON.stringify(map)).toString("base64")}\n`

test("real Bun splitting façades retain truthful empty maps and the same shared runtime module", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tech-build-linking-map-"))
  try {
    const main = join(directory, "main.ts")
    const second = join(directory, "second.ts")
    await Bun.write(main, 'export const load = () => import("./shared.ts")\n')
    await Bun.write(second, 'import {answer} from "./shared.ts"\nexport {answer}\nexport const direct = answer()\n')
    await Bun.write(join(directory, "shared.ts"), 'export function answer() {return 42}\n')
    const built = await Bun.build({entrypoints: [main, second], target: "bun", format: "esm", splitting: true, sourcemap: "inline",
      minify: true, outdir: join(directory, "out"), naming: {entry: "[name].js", chunk: "chunk/[hash].js"}})
    expect(built.success, built.logs.map(String).join("\n")).toBeTrue()
    let façades = 0
    for (const output of built.outputs) {
      const original = await output.text()
      await mkdir(dirname(output.path), {recursive: true})
      await Bun.write(output.path, original)
      const index = original.lastIndexOf(marker)
      expect(index).toBeGreaterThan(0)
      const map = JSON.parse(Buffer.from(original.slice(index + marker.length).split(/\r?\n/, 1)[0]!.trim(), "base64").toString("utf8"))
      if (map.sources.length === 0) {
        expect(output.kind).toBe("chunk")
        await expect(externalizeSourceMap(output.path)).rejects.toThrow("sources")
        expect(await Bun.file(output.path).text()).toBe(original)
        façades++
      }
      await externalizeSourceMap(output.path, {generatedLinkingChunk: output.kind === "chunk"})
      const actual = await Bun.file(`${output.path}.map`).json()
      delete map.debugId
      expect(actual).toEqual(map)
      expect(await Bun.file(output.path).text()).toBe(canonicalExecutableSource(original.slice(0, index)))
    }
    expect(façades).toBeGreaterThan(0)
    const imported = await import(pathToFileURL(join(directory, "out/main.js")).href)
    const other = await import(pathToFileURL(join(directory, "out/second.js")).href)
    const lazy = await imported.load()
    expect(lazy.answer()).toBe(42)
    expect(lazy.answer).toBe(other.answer)
  } finally {await rm(directory, {recursive: true, force: true})}
})

test("empty maps never admit an executable body, invalid source references or a legacy/root output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tech-build-invalid-empty-map-"))
  const path = join(directory, "output.js")
  try {
    for (const body of ['export const answer = 42', 'import "./shared.js"; globalThis.effect = true', 'export function answer() {return 42}', '"use strict"; export {answer} from "./shared.js"']) {
      const source = inline(body)
      await Bun.write(path, source)
      await expect(externalizeSourceMap(path, {generatedLinkingChunk: true})).rejects.toThrow("sources")
      expect(await Bun.file(path).text()).toBe(source)
      expect(await Bun.file(`${path}.map`).exists()).toBeFalse()
    }
    await Bun.write(path, inline('export {answer} from "./shared.js"'))
    await expect(externalizeSourceMap(path)).rejects.toThrow("sources")
    await Bun.write(path, inline('export {answer} from "./shared.js"', {...emptyMap, mappings: "AAAA"}))
    await expect(externalizeSourceMap(path, {generatedLinkingChunk: true})).rejects.toThrow("sources")
    await Bun.write(path, inline('export {answer} from "./shared.js"', {version: 3, mappings: ""}))
    await expect(externalizeSourceMap(path, {generatedLinkingChunk: true})).rejects.toThrow("sources")
  } finally {await rm(directory, {recursive: true, force: true})}
})

test("source-free module import and ordinary map validation do not load the native build parser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tech-build-lazy-parser-"))
  try {
    await Bun.write(join(directory, "node_modules/oxc-parser/package.json"), JSON.stringify({name: "oxc-parser", type: "module", exports: "./index.js"}))
    await Bun.write(join(directory, "node_modules/oxc-parser/index.js"), 'throw new Error("native build parser must not load during runtime import")\n')
    const built = await Bun.build({entrypoints: [new URL("../source-map.ts", import.meta.url).pathname], target: "bun", format: "esm", external: ["oxc-parser"]})
    expect(built.success, built.logs.map(String).join("\n")).toBeTrue()
    const module = join(directory, "source-map.mjs")
    await Bun.write(module, await built.outputs[0]!.text())
    const artifact = join(directory, "entry.js")
    await Bun.write(artifact, inline("export const value=1", {version: 3, sources: ["entry.ts"], sourcesContent: ["export const value=1"], names: [], mappings: "AAAA"}))
    const probe = join(directory, "probe.mjs")
    await Bun.write(probe, `import {externalizeSourceMap} from "./source-map.mjs"\nawait externalizeSourceMap(${JSON.stringify(artifact)}, {generatedLinkingChunk:true})\nconsole.log("runtime import without native parser PASS")\n`)
    const child = Bun.spawn([process.execPath, probe], {cwd: directory, stdout: "pipe", stderr: "pipe"})
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code, stderr).toBe(0)
    expect(stdout).toContain("runtime import without native parser PASS")
  } finally {await rm(directory, {recursive: true, force: true})}
})
