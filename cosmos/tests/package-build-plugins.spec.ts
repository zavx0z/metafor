import {expect, setDefaultTimeout, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {packageOwners} from "../release/server/package/manifest"
import {readPackageBuildConfigurations} from "../release/server/package/config"
import {
  packageBuildCommand,
  packageProgrammaticBuildPlan,
} from "../release/server/package/command"
import type {PackageManifest} from "../release/server/shared/contracts"

const cosmos = fileURLToPath(new URL("../", import.meta.url))

setDefaultTimeout(30_000)

test("packages without Cosmos plugin config preserve direct Bun commands", async () => {
  for (const name of ["@cosmos/startup", "@cosmos/release", "@internal/visual"]) {
    for (const owner of await packageOwners(name)) {
      expect(owner.plugins).toEqual([])
      expect(owner.loaders).toEqual(name === "@internal/visual" ? {".wgsl": "text"} : {})
      expect(packageBuildCommand(owner.build, "production").join(" ")).toBe(owner.build)
    }
  }
})

test("plugin command plan preserves production and development profiles", () => {
  const command = [
    "bun build ./main/index.ts",
    "--conditions=internal:main",
    "--target=browser",
    "--format=esm",
    "--packages=external",
    "--external=@fixture/runtime",
    "--production",
    "--minify",
    "--drop console.debug",
    "--drop=fixture.trace",
    "--outfile=dist/main.js",
  ].join(" ")

  expect(packageProgrammaticBuildPlan(command, "production", "single")).toEqual({
    conditions: ["internal:main"],
    drop: ["console.debug", "fixture.trace"],
    entrypoint: "./main/index.ts",
    external: ["@fixture/runtime"],
    format: "esm",
    minify: true,
    mode: "single",
    outfile: "dist/main.js",
    packages: "external",
    profile: "production",
    sourcemap: "none",
    target: "browser",
  })
  expect(packageProgrammaticBuildPlan(command, "development", "single")).toEqual({
    conditions: ["internal:main"],
    drop: ["fixture.trace"],
    entrypoint: "./main/index.ts",
    external: ["@fixture/runtime"],
    format: "esm",
    minify: true,
    mode: "single",
    outfile: "dist/main.js",
    packages: "external",
    profile: "development",
    sourcemap: "inline",
    target: "browser",
  })

  for (const unsupported of [
    command.replace(" --outfile=dist/main.js", " --outdir=dist/main --splitting"),
    command.replace("bun build ./main/index.ts", "bun build ./main/index.ts ./main/lazy.ts"),
    command.replace(" --target=browser", " --target=node"),
  ]) expect(() => packageProgrammaticBuildPlan(unsupported, "production", "single")).toThrow()
})

test("package build config resolves only contained and direct-dependency plugins", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-build-config-")))
  const outside = join(dirname(root), `${root.split("/").at(-1)}-outside.ts`)
  const manifest: PackageManifest = {
    name: "@fixture/owner",
    devDependencies: {"@fixture/compiler": "1.0.0"},
  }

  try {
    await Promise.all([
      writeSource(join(root, "build/local.ts"), validPlugin("local")),
      writeJson(join(root, "node_modules/@fixture/compiler/package.json"), {
        name: "@fixture/compiler",
        version: "1.0.0",
        type: "module",
        exports: {"./plugin": "./plugin.ts"},
      }),
      writeSource(
        join(root, "node_modules/@fixture/compiler/plugin.ts"),
        validPlugin("dependency"),
      ),
      writeSource(join(root, "bunfig.toml"), [
        "[loader]",
        '".wgsl" = "text"',
        "",
        "[cosmos.package-build.environments.main]",
        'plugins = ["./build/local.ts", "@fixture/compiler/plugin"]',
        "",
      ].join("\n")),
    ])

    const configurations = await readPackageBuildConfigurations(root, manifest, ["main"])
    expect(configurations.get("main")?.loaders).toEqual({".wgsl": "text"})
    expect(configurations.get("main")?.plugins).toEqual([
      await realpath(join(root, "build/local.ts")),
      await realpath(join(root, "node_modules/@fixture/compiler/plugin.ts")),
    ])

    await writeSource(join(root, "bunfig.toml"), [
      "[loader]",
      '".wgsl" = "text"',
      "",
    ].join("\n"))
    const loaderOnly = await readPackageBuildConfigurations(
      root,
      {name: "@fixture/owner"},
      ["main", "server"],
    )
    expect(loaderOnly.get("main")).toEqual({loaders: {".wgsl": "text"}, plugins: []})
    expect(loaderOnly.get("server")).toEqual({loaders: {".wgsl": "text"}, plugins: []})

    await writeSource(join(root, "bunfig.toml"), [
      "[cosmos.package-build.environments.main]",
      'plugins = ["@fixture/compiler/plugin"]',
      "",
    ].join("\n"))
    await expect(readPackageBuildConfigurations(root, {name: "@fixture/owner"}, ["main"]))
      .rejects.toThrow("must be a direct dependency")

    await writeSource(outside, validPlugin("outside"))
    await mkdir(join(root, "build"), {recursive: true})
    await rm(join(root, "build/escape.ts"), {force: true})
    await symlink(outside, join(root, "build/escape.ts"))
    await writeSource(join(root, "bunfig.toml"), [
      "[cosmos.package-build.environments.main]",
      'plugins = ["./build/escape.ts"]',
      "",
    ].join("\n"))
    await expect(readPackageBuildConfigurations(root, manifest, ["main"]))
      .rejects.toThrow("escapes package root")
  } finally {
    await rm(outside, {force: true})
    await rm(root, {recursive: true, force: true})
  }
})

test("package build config rejects unknown tables, environments and plugin shapes", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-build-config-invalid-")))
  const manifest: PackageManifest = {name: "@fixture/owner"}

  try {
    const invalid = [
      [
        "[cosmos.package-build]",
        'protocol = "package-build/1"',
      ].join("\n"),
      [
        "[cosmos.package-build.environments.worker]",
        'plugins = ["./plugin.ts"]',
      ].join("\n"),
      [
        "[cosmos.package-build.environments.main]",
        "plugins = []",
      ].join("\n"),
      [
        "[cosmos.package-build.environments.main]",
        'plugins = ["./plugin.ts"]',
        "splitting = true",
      ].join("\n"),
    ]

    for (const source of invalid) {
      await writeSource(join(root, "bunfig.toml"), `${source}\n`)
      await expect(readPackageBuildConfigurations(root, manifest, ["main"]))
        .rejects.toThrow()
    }
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

test("isolated plugin adapter compiles TSX and preserves both build profiles", async () => {
  const production = await pluginFixture({profile: "production"})
  expect(production).toMatchObject({
    success: true,
    exitCode: 0,
    outputs: 1,
    compiled: true,
    debug: false,
    inlineMap: false,
    sourceMap: false,
    runtimeJsx: false,
  })

  const development = await pluginFixture({profile: "development"})
  expect(development).toMatchObject({
    success: true,
    exitCode: 0,
    outputs: 2,
    compiled: true,
    debug: true,
    inlineMap: false,
    sourceMap: true,
    runtimeJsx: false,
  })
})

test("isolated plugin adapter rejects a module without default Bun plugin", async () => {
  const result = await pluginFixture({profile: "production", pluginExport: "invalid"})
  expect(result.success).toBeFalse()
  expect(result.exitCode).toBe(1)
  expect(result.outputs).toBe(0)
  expect(result.stderr).toContain("must default export a Bun plugin")
})

test("isolated plugin adapter keeps validated build parameters immutable", async () => {
  const result = await pluginFixture({profile: "production", pluginExport: "mutating"})
  expect(result.success).toBeFalse()
  expect(result.exitCode).toBe(1)
  expect(result.outputs).toBe(0)
  expect(result.stderr).toContain("cannot modify the validated build plan")
})

test("isolated plugin adapter fails closed when a plugin mutates build outputs", async () => {
  const result = await pluginFixture({profile: "production", pluginExport: "mutating-output"})
  expect(result.success).toBeFalse()
  expect(result.exitCode).toBe(1)
  expect(result.outputs).toBe(0)
  expect(result.stderr).toContain("root output is missing")
})

interface PluginFixtureResult {
  success: boolean
  exitCode: number | null
  stderr: string
  outputs: number
  compiled: boolean
  debug: boolean
  inlineMap: boolean
  sourceMap: boolean
  runtimeJsx: boolean
}

async function pluginFixture(options: {
  profile: "development" | "production"
  pluginExport?: "invalid" | "mutating" | "mutating-output"
}): Promise<PluginFixtureResult> {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "test",
    "./tests/fixture/package-build-plugin-process.ts",
  ], {
    cwd: cosmos,
    env: {
      ...process.env,
      NODE_ENV: options.profile,
      ...(options.pluginExport === undefined
        ? {}
        : {PACKAGE_PLUGIN_EXPORT: options.pluginExport}),
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Plugin fixture failed: ${stderr || stdout}`)
  const source = stdout.split("\n").find((line) => line.startsWith('{"success"'))
  if (!source) throw new Error(`Plugin fixture result is missing: ${stdout}`)
  return JSON.parse(source) as PluginFixtureResult
}

function validPlugin(name: string) {
  return [
    "export default {",
    `  name: ${JSON.stringify(name)},`,
    "  setup() {},",
    "}",
    "",
  ].join("\n")
}

async function writeJson(path: string, value: unknown) {
  await writeSource(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeSource(path: string, source: string) {
  await mkdir(dirname(path), {recursive: true})
  await Bun.write(path, source)
}
