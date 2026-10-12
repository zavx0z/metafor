import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {pathToFileURL} from "node:url"
import {extname, join} from "node:path"
import {createPackageBuilder} from "../build"
import {createPackageReader} from "../manifest"
import {createInstalledReleaseStore, type PublishedReleaseGraph} from "../../release/installed"

for (const profile of ["production", "development"] as const) test(`${profile} ordinary Bun public entry executes its immutable graph after source deletion`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "server-alias-"))
  const root = join(directory, "source")
  const outdir = join(directory, "build")
  try {
    await mkdir(join(root, "server"), {recursive: true})
    await writeFile(join(root, "package.json"), JSON.stringify({name: "@owner/server", version: "1.0.0", type: "module", exports: {
      ".": {"owner:server": "./server/index.ts"}, "./entry": "./entry.ts", "./resource.txt": "./resource.txt",
    }, dependencies: {"absent-optional-fixture": "1.0.0"}, scripts: {typecheck: "bun -e 'process.exit(0)'", "build:server": "bun build ./server/index.ts --conditions=owner:server --target=bun --format=esm --production --minify --outdir=dist/server --splitting"}}))
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({compilerOptions: {baseUrl: ".", paths: {lib: ["./alias.ts"], types: ["./alias-types.ts"]}}}))
    await writeFile(join(root, "alias.ts"), "export const aliasValue='alias'\n")
    await writeFile(join(root, "alias-types.ts"), "export const typedAlias='types'\n")
    await writeFile(join(root, "server/index.ts"), "export {current} from '../shared'\nexport const open=()=>import('../entry')\n")
    await writeFile(join(root, "shared.ts"), "let count=0\nexport const increment=()=>++count\nexport const current=()=>count\n")
    await writeFile(join(root, "entry.ts"), `
import {increment} from './shared'
import file from './resource.txt' with {type:'file'}
import {aliasValue} from 'lib'
import {typedAlias} from 'types'
let optional=false
try{optional=Boolean(require('absent-optional-fixture'))}catch{}
globalThis.serverEntryLoads=(globalThis.serverEntryLoads??0)+1
export default async () => ({alias:aliasValue+typedAlias,optional,count:increment(),unicode:"Привет😀",lazy:(await import('./lazy')).default,resource:await Bun.file(new URL(file,import.meta.url)).text()})
export const mapped=()=>{throw new Error('server-map-proof')}
`)
    await writeFile(join(root, "lazy.ts"), "globalThis.serverLazyLoads=(globalThis.serverLazyLoads??0)+1\nexport default 'lazy'\n")
    await writeFile(join(root, "resource.txt"), "immutable-resource")
    const reader = createPackageReader({resolvePackage: () => root})
    const owner = await reader.packageOwner("@owner/server", "server")
    const prepared = await createPackageBuilder({resolvePackage: () => root, profile}).buildPackage("@owner/server", {env: "server", outdir, version: "1.0.0"})
    if (!prepared.success) throw new Error(prepared.stderr)
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: prepared.module, version: "1.0.0", dependencies: {}, environments: [{env: "server",
      publicArtifacts: Object.fromEntries(owner.sources.filter(source => source.artifact !== ".").map(source => [source.artifact, source.source.endsWith(".ts") ? ".js" : extname(source.source)])),
      outputs: prepared.outputs.map(output => ({artifact: output.artifact!, kind: output.kind!, type: output.type, sha256: output.sha256, size: output.size, load: output.load!, ...(output.sourceMapFor ? {sourceMapFor: output.sourceMapFor} : {})})),
    }]}]}
    const store = createInstalledReleaseStore({root: join(directory, "installed")})
    const candidate = await store.prepare(graph, {async read(identity) {
      return Bun.file(prepared.outputs.find(output => output.artifact === identity.artifact && output.sha256 === identity.sha256)!.path).stream()
    }})
    const path = async (artifact: string) => store.artifactPath(candidate.digest, {name: prepared.module, version: "1.0.0", env: "server",
      ...graph.packages[0]!.environments[0]!.outputs.find(output => output.artifact === artifact && output.kind !== "sourcemap")!})
    const rootEntry = await path(".")
    const publicEntry = await path("./entry")
    if (profile === "development") {
      const lines = (await Bun.file(join(root, "entry.ts")).text()).split("\n")
      const originalLine = lines.findIndex(line => line.includes("server-map-proof"))
      const originalColumn = lines[originalLine]!.indexOf("server-map-proof")
      for (const output of prepared.outputs.filter(output => output.type.includes("javascript"))) {
        const code = await Bun.file(output.path).text()
        const offset = code.indexOf("server-map-proof")
        if (offset < 0) continue
        const prefix = code.slice(0, offset)
        const line = prefix.split("\n").length - 1
        const column = offset - prefix.lastIndexOf("\n") - 1
        const companion = prepared.outputs.find(map => map.sourceMapFor === output.artifact)!
        const decoded = originalPosition(await Bun.file(companion.path).json(), line, column)
        expect(decoded.source).toBe(pathToFileURL(join(owner.root, "entry.ts")).href)
        expect(decoded.line).toBe(originalLine)
        expect(decoded.column).toBeGreaterThanOrEqual(originalColumn - 1)
        expect(decoded.column).toBeLessThanOrEqual(originalColumn)
      }
    }
    await rm(root, {recursive: true, force: true})
    await rm(outdir, {recursive: true, force: true})
    const runner = join(directory, "run.ts")
    await writeFile(runner, `
import {pathToFileURL} from 'node:url'
const entry=await import(pathToFileURL(process.argv[3]).href)
const root=await import(pathToFileURL(process.argv[2]).href)
const before=globalThis.serverLazyLoads??0
const lazyEntry=await root.open()
const first=await entry.default()
const second=await lazyEntry.default()
console.log(JSON.stringify({same:entry===lazyEntry,before,entryLoads:globalThis.serverEntryLoads,lazyLoads:globalThis.serverLazyLoads,first,second,current:root.current()}))
`)
    const child = Bun.spawn([process.execPath, runner, rootEntry, publicEntry], {cwd: directory, stdout: "pipe", stderr: "pipe"})
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout)).toEqual({same: true, before: 0, entryLoads: 1, lazyLoads: 1, first: {alias: "aliastypes", optional: false, count: 1, unicode: "Привет😀", lazy: "lazy", resource: "immutable-resource"}, second: {alias: "aliastypes", optional: false, count: 2, unicode: "Привет😀", lazy: "lazy", resource: "immutable-resource"}, current: 2})
    if (profile === "development") {
      const scripts = prepared.outputs.filter(output => output.type.includes("javascript"))
      const maps = prepared.outputs.filter(output => output.kind === "sourcemap")
      expect(maps).toHaveLength(scripts.length)
      expect(new Set(maps.map(output => output.artifact)).size).toBe(maps.length)
    }
  } finally { await rm(directory, {recursive: true, force: true}) }
})

// A minimal standard source-map consumer checks the original token position,
// rather than asserting the implementation's replacement offsets.
function originalPosition(map: {mappings: string; sources: string[]}, line: number, column: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  let source = 0, originalLine = 0, originalColumn = 0
  let position: {source: string; line: number; column: number} | undefined
  for (const [index, encoded] of map.mappings.split(";").entries()) {
    let generated = 0
    for (const segment of encoded.split(",")) {
      if (!segment) continue
      const values: number[] = []
      let raw = 0, shift = 0
      for (const char of segment) {
        const digit = alphabet.indexOf(char)
        raw += (digit & 31) * 2 ** shift
        if (digit & 32) shift += 5
        else {values.push(raw & 1 ? -(raw >>> 1) : raw >>> 1); raw = 0; shift = 0}
      }
      generated += values[0]!
      if (index === line && generated > column) return position!
      if (values.length >= 4) {
        source += values[1]!
        originalLine += values[2]!
        originalColumn += values[3]!
        if (index === line) position = {source: map.sources[source]!, line: originalLine, column: originalColumn}
      }
    }
    if (index === line) return position!
  }
  throw new Error("Source map position is missing")
}
