import {expect, setDefaultTimeout, test} from "bun:test"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {
  packageArtifactPath,
  packageProgrammaticBuildPlan,
} from "../release/server/package/command"
import {packageArtifact} from "../release/server/package/manifest"
import {validatePackageBuildSourceOutputs} from "../release/server/package/source"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

setDefaultTimeout(30_000)

test("multi-entry command keeps one root source and requires outdir plus splitting", () => {
  const command = [
    "bun build ./main/index.ts",
    "--conditions=internal:main",
    "--target=browser",
    "--production",
    "--minify",
    "--drop console.debug",
    "--outdir=dist/main",
    "--splitting",
  ].join(" ")
  expect(packageProgrammaticBuildPlan(command, "production", "multi")).toEqual({
    conditions: ["internal:main"],
    drop: ["console.debug"],
    entrypoint: "./main/index.ts",
    external: [],
    minify: true,
    mode: "multi",
    outdir: "dist/main",
    profile: "production",
    sourcemap: "none",
    splitting: true,
    target: "browser",
  })
  expect(packageProgrammaticBuildPlan(command, "development", "multi")).toMatchObject({
    drop: [],
    mode: "multi",
    sourcemap: "inline",
    splitting: true,
  })
  expect(packageArtifactPath("/fixture", command)).toBe("/fixture/dist/main/index.js")

  for (const invalid of [
    command.replace(" --splitting", ""),
    command.replace(" --outdir=dist/main", " --outfile=dist/main.js"),
    command.replace("bun build ./main/index.ts", "bun build ./main/index.ts ./main/lazy.ts"),
    `${command} --entry-naming=custom/[name].[ext]`,
    `${command} --public-path=/custom/`,
    `${command} --define=import.meta.env.COSMOS_PACKAGE_NAME=\"wrong\"`,
  ]) expect(() => packageProgrammaticBuildPlan(invalid, "production", "multi")).toThrow()
})

test("one memory build maps TS, TSX, CSS, WASM and shared chunks without a manifest", async () => {
  const result = await multiFixture("production")
  expect(result.success).toBeTrue()
  expect(result.exitCode).toBe(0)
  expect(result.stderr).not.toContain("Package build")

  const byArtifact = new Map(result.outputs.map((output) => [output.artifact, output]))
  const root = byArtifact.get(".")!
  const componentA = byArtifact.get("./component-a")!
  const componentAGenerated = generatedAlias(componentA, result.outputs)
  const componentB = byArtifact.get("./component-b")!
  const componentBGenerated = generatedAlias(componentB, result.outputs)
  const theme = byArtifact.get("./theme.css")!
  const themeGenerated = generatedAlias(theme, result.outputs)
  const wasm = byArtifact.get("./kernel.wasm")!
  const chunks = result.outputs.filter(({artifact, kind}) =>
    artifact.startsWith("./.cosmos/chunk/") && kind === "chunk")

  expect(root.load).toBe("eager")
  expect(root.source).toContain("/@internal/visual/theme.css?env=main&version=1.0.1")
  expect(root.source).toContain("@internal/visual")
  expect(root.source).toContain("@fixture/external")
  expect(result.outputs.filter(({path}) => path === root.path)).toHaveLength(1)
  expect(chunks.length).toBeGreaterThan(0)
  expect(chunks.every(({load}) => load === "eager")).toBeTrue()

  expect(componentA.load).toBe("lazy")
  expect(componentAGenerated.path).toBe(componentA.path)
  expect(componentAGenerated.load).toBe("lazy")
  expect(componentB.load).toBe("lazy")
  expect(componentBGenerated.path).toBe(componentB.path)
  expect(componentB.source).toContain("compiled-button")
  expect(componentB.source).not.toMatch(/jsx-runtime|jsxDEV|createElement|<button/)

  expect(theme.kind).toBe("asset")
  expect(theme.type).toStartWith("text/css")
  expect(theme.load).toBe("eager")
  expect(themeGenerated.path).toBe(theme.path)
  expect(themeGenerated.load).toBe("lazy")
  expect(wasm.kind).toBe("copy")
  expect(wasm.type).toBe("application/wasm")
  expect(wasm.load).toBe("lazy")
  expect(wasm.source).toContain("fixture-wasm-bytes")

  expect(result.outputs.every(({path}) => path.startsWith(`${result.outdir}/`))).toBeTrue()
  expect(result.files.some((path) => /^entry\/[a-z0-9]+\.(?:js|css)$/.test(path))).toBeTrue()
  expect(result.files.some((path) => /^chunk\/[a-z0-9]+\.js$/.test(path))).toBeTrue()
  expect(result.files).toContain("raw/kernel.wasm")
  expect(result.files.some((path) => /report|metafile|manifest/i.test(path))).toBeFalse()
})

test("multi-entry development keeps an inline map for every JavaScript output", async () => {
  const result = await multiFixture("development")
  expect(result.success).toBeTrue()
  const javascript = result.outputs.filter(({kind, type}) =>
    (kind === "entry-point" || kind === "chunk") && type.startsWith("text/javascript"))
  expect(javascript.length).toBeGreaterThan(0)
  expect(javascript.every(({inlineMap}) => inlineMap)).toBeTrue()
  expect(result.outputs.some(({kind}) => kind === "sourcemap")).toBeFalse()
})

test("multi-entry graph uses the memory adapter even without compiler plugins", async () => {
  const result = await multiFixture("production", "valid", "none")
  expect(result.success).toBeTrue()
  const component = result.outputs.find(({artifact}) => artifact === "./component-b")!
  const alias = generatedAlias(component, result.outputs)
  expect(component.source).toContain("plain-button")
  expect(alias.path).toBe(component.path)
  expect(result.files.some((path) => /^entry\/[a-z0-9]+\.js$/.test(path))).toBeTrue()
})

test("multi-output staging requires a paired version and rejects artifact mixing", async () => {
  const missingVersion = await multiFixture("production", "missing-version")
  expect(missingVersion.success).toBeFalse()
  expect(missingVersion.stderr).toContain("outdir and version must be provided together")

  const mixed = await multiFixture("production", "artifact-combination")
  expect(mixed.success).toBeFalse()
  expect(mixed.stderr).toContain("artifact cannot be combined")

  const invalidVersion = await multiFixture("production", "invalid-version")
  expect(invalidVersion.success).toBeFalse()
  expect(invalidVersion.stderr).toContain("not canonical SemVer")
})

test("artifact reader preserves legacy JavaScript MIME and infers static file types", async () => {
  const root = await mkdtemp(join(tmpdir(), "cosmos-artifact-mime-"))
  try {
    const expected = {
      "root.js": "text/javascript; charset=utf-8",
      "root.js.map": "application/json; charset=utf-8",
      "theme.css": "text/css;charset=utf-8",
      "kernel.wasm": "application/wasm",
      "data.json": "application/json;charset=utf-8",
      "icon.svg": "image/svg+xml",
      "image.png": "image/png",
      "font.ttf": "font/ttf",
      "shader.wgsl": "application/octet-stream",
      "payload.bin": "application/octet-stream",
    }
    await mkdir(root, {recursive: true})
    for (const path of Object.keys(expected)) await Bun.write(join(root, path), "bytes")
    for (const [path, type] of Object.entries(expected))
      expect((await packageArtifact(join(root, path)))?.type).toBe(type)
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

test("public artifact keys cannot normalize to one physical output", () => {
  expect(() => validatePackageBuildSourceOutputs("main", [
    {artifact: ".", source: "./main/index.ts"},
    {artifact: "./foo", source: "./main/foo.ts"},
    {artifact: "./foo.js", source: "./main/other.ts"},
  ])).toThrow("./foo and ./foo.js share output foo.js")
})

test("package manifest rejects public physical aliases before build", async () => {
  const result = await multiFixture("production", "valid", "enabled", true)
  expect(result.success).toBeFalse()
  expect(result.stderr).toContain("./component-a and ./component-a.js share output component-a.js")
  expect(result.outputs).toEqual([])
})

test("root plus raw-only graph stages the complete next version in one outdir", async () => {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "test",
    "./tests/fixture/package-build-raw-process.ts",
  ], {
    cwd: cosmos,
    env: {...process.env, NODE_ENV: "production"},
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Raw package fixture failed: ${stderr || stdout}`)
  const source = stdout.split("\n").find((line) => line.startsWith('{"success"'))
  if (!source) throw new Error(`Raw package fixture result is missing: ${stdout}`)
  const result = JSON.parse(source) as MultiFixtureResult & {wasm: string}
  expect(result.success).toBeTrue()
  expect(result.outputs.map(({artifact}) => artifact)).toEqual([".", "./kernel.wasm"])
  expect(result.outputs.every(({path}) => path.startsWith(`${result.outdir}/`))).toBeTrue()
  expect(result.outputs.find(({artifact}) => artifact === "./kernel.wasm")).toMatchObject({
    kind: "copy",
    load: "lazy",
    type: "application/wasm",
  })
  expect(result.wasm).toBe("raw-wasm-v1")
})

interface FixtureOutput {
  artifact: string
  kind: string
  load: "eager" | "lazy"
  path: string
  type: string
  source: string
  inlineMap: boolean
}

interface MultiFixtureResult {
  success: boolean
  exitCode: number | null
  stderr: string
  outdir: string
  outputs: FixtureOutput[]
  files: string[]
}

async function multiFixture(
  profile: "development" | "production",
  options = "valid",
  plugin = "enabled",
  collision = false,
): Promise<MultiFixtureResult> {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "test",
    "./tests/fixture/package-build-multi-process.ts",
  ], {
    cwd: cosmos,
    env: {
      ...process.env,
      NODE_ENV: profile,
      PACKAGE_MULTI_OPTIONS: options,
      PACKAGE_MULTI_PLUGIN: plugin,
      PACKAGE_MULTI_EXPORT_COLLISION: collision ? "1" : "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Multi-entry fixture failed: ${stderr || stdout}`)
  const source = stdout.split("\n").find((line) => line.startsWith('{"success"'))
  if (!source) throw new Error(`Multi-entry fixture result is missing: ${stdout}`)
  return JSON.parse(source) as MultiFixtureResult
}

function generatedAlias(publicOutput: FixtureOutput, outputs: FixtureOutput[]) {
  const aliases = outputs.filter(({path, artifact}) =>
    path === publicOutput.path && artifact.startsWith("./.cosmos/"))
  expect(aliases).toHaveLength(1)
  return aliases[0]!
}
