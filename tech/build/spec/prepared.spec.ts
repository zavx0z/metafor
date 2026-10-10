import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createPackageBuilder} from "../build"
import {digest, type PreparedPackageDependency} from "../prepared"
import {executeBuildFixture} from "./fixture"
import {createRelease} from "@metafor/tech-release"

/** Готовый core не читается Bun compiler; связывается только новый consumer. */
test("готовый ESM граф сохраняет bytes, identity, eager/lazy и cold receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tech-prepared-"))
  try {
    const root = join(directory, "consumer")
    const core = join(directory, "core")
    await mkdir(join(root, "main"), {recursive: true})
    await mkdir(core)
    const manifest = {
      name: "@internal/example", version: "1.0.0", type: "module",
      exports: {".": {"internal:main": "./main/index.ts"}, "./extra": {"internal:main": "./main/extra.ts"}},
      dependencies: {"@fixture/core": "1.0.0"},
      scripts: {typecheck: "bun check.ts", "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --outdir=dist --splitting"},
    }
    await Bun.write(join(root, "package.json"), JSON.stringify(manifest))
    await Bun.write(join(directory, "package.json"), JSON.stringify({dependencies: {"@internal/example": "workspace:^1.0.0"}}))
    await Bun.write(join(root, "check.ts"), "export {}\n")
    await Bun.write(join(root, "main/index.ts"), 'import {value, lazy, increment} from "@fixture/core"\nexport {lazy, increment}\nexport const result = value + 1\n')
    await Bun.write(join(root, "main/extra.ts"), 'export {value} from "@fixture/core"\n')
    await Bun.write(join(root, "bunfig.toml"), '[cosmos.package-build.environments.main]\nplugins = ["./guard.ts"]\n')
    await Bun.write(join(root, "guard.ts"), 'export default {name: "no-core-compilation", setup(build) {build.onLoad({filter: /core/}, () => {throw new Error("core must not be compiled")})}}\n')
    const sources = {
      "index.js": '/* READY CORE */\nimport {value, increment} from "./shared.js"\nexport {value, increment}\nexport const lazy = () => import("./lazy.js")\n//# sourceMappingURL=index.js.map\n',
      "shared.js": 'export let value = 40\nexport const increment = () => {value += 1}\n',
      "lazy.js": 'import {value} from "./shared.js"\nexport const answer = value + 2\n',
      "index.js.map": '{"version":3,"sources":["original.ts"],"sourcesContent":["ready core"],"mappings":""}',
    }
    for (const [path, bytes] of Object.entries(sources)) await Bun.write(join(core, path), bytes)
    const dependency: PreparedPackageDependency = {
      name: "@fixture/core", version: "1.0.0", root: core,
      entries: {"@fixture/core": "index.js"},
      files: Object.entries(sources).map(([path, bytes]) => ({path, digest: digest(new TextEncoder().encode(bytes).buffer)})),
    }
    let resolutions = 0
    const builder = createPackageBuilder({resolvePackage: () => root, preparedDependencies: async () => {resolutions += 1; return [dependency]}})
    const first = await builder.buildPackage(manifest.name)
    expect(first.success, first.stderr).toBe(true)
    const ready = first.outputs.filter(output => output.artifact?.includes("chunk/"))
    expect(ready).toHaveLength(4)
    for (const [path, bytes] of Object.entries(sources)) {
      const output = ready.find(output => output.artifact?.endsWith(`/${path}`))!
      expect(await Bun.file(output.path).text()).toBe(bytes)
      expect(output.sha256).toBe(dependency.files.find(file => file.path === path)!.digest)
      expect(output.load).toBe(path === "index.js" || path === "shared.js" ? "eager" : "lazy")
    }
    const executed = await executeBuildFixture(directory, [first], "1.0.0", 'const app = await load("main"); app.increment(); return [app.result, (await app.lazy()).answer]')
    expect(executed).toEqual([41, 43])
    const main = await Bun.file(first.outputs.find(output => output.artifact === ".")!.path).text()
    expect(main).not.toContain("READY CORE")
    expect(main).toContain("/@internal/example/.cosmos/main/1.0.0/chunk/")
    const development = createPackageBuilder({resolvePackage: () => root, profile: "development", preparedDependencies: async () => [dependency]})
    const debug = await development.buildPackage(manifest.name, {version: "1.0.0", outdir: join(directory, "debug")})
    expect(debug.success, debug.stderr).toBe(true)
    for (const file of dependency.files) {
      const output = debug.outputs.find(output => output.artifact?.endsWith(`/${file.path}`))!
      expect(output.sha256).toBe(file.digest)
    }
    const invalid = createPackageBuilder({resolvePackage: () => root, preparedDependencies: async () => [{
      ...dependency, files: dependency.files.map(file => ({...file, digest: "0".repeat(64)})),
    }]})
    const rejected = await invalid.buildPackage(manifest.name)
    expect(rejected.success).toBe(false)
    expect(rejected.stage).toBe("configuration")
    expect(rejected.stderr).toContain("digest differs")
    await Bun.write(join(root, "main/index.ts"), 'import {value, lazy, increment} from "@fixture/core"\nexport {lazy, increment}\nexport const result = value + 2\n')
    const second = await builder.buildPackage(manifest.name, {version: "1.0.1", outdir: join(directory, "second")})
    expect(second.success, second.stderr).toBe(true)
    expect(second.outputs.filter(output => output.artifact?.includes("chunk/")).map(output => output.sha256)).toEqual(ready.map(output => output.sha256))
    const release = createRelease({root: directory, builder, isMember: name => name === manifest.name})
    await release.recoverPublication()
    const beforeCold = resolutions
    await rm(core, {recursive: true})
    const cold = createRelease({root: directory, builder, isMember: name => name === manifest.name})
    await cold.recoverPublication()
    expect(resolutions).toBe(beforeCold)
    expect(cold.readDesiredBrowserArtifacts().filter(output => output.artifact?.includes("chunk/"))).toHaveLength(2)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
}, 30_000)

/** Public facade сохраняет право экспортировать resource вложенной реализации. */
test("public dependency export разрешает вложенного implementation owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tech-public-owner-"))
  try {
    const library = join(directory, "node_modules/@fixture/library")
    await mkdir(join(library, "implementation"), {recursive: true})
    await Bun.write(join(directory, "main/index.ts"), 'export {}\n')
    await Bun.write(join(library, "package.json"), JSON.stringify({name: "@fixture/library", exports: {"./theme.css": "./implementation/theme.css"}}))
    await Bun.write(join(library, "implementation/package.json"), JSON.stringify({name: "@fixture/private"}))
    await Bun.write(join(library, "implementation/theme.css"), 'body { color: red }\n')
    const {packageExportGraph} = await import("../export-graph")
    const manifest = {name: "@internal/example", dependencies: {"@fixture/library": "1.0.0"}, exports: {
      ".": {"internal:main": "./main/index.ts"}, "./theme.css": "@fixture/library/theme.css",
    }}
    const outputs = await packageExportGraph(directory, manifest)
    expect(outputs.find(output => output.artifact === "./theme.css")?.source).toEndWith("implementation/theme.css")
    await expect(packageExportGraph(directory, {...manifest, exports: {
      ...manifest.exports, "./theme.css": "@fixture/library/implementation/theme.css",
    }})).rejects.toThrow("Cannot resolve public export")
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})
