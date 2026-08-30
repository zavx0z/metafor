import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"

test("multi-entry package build fixture", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-package-multi-")))
  const repository = join(root, "repository")
  const cosmos = join(repository, "cosmos")
  const packageRoot = join(cosmos, "internal/visual")
  const outdir = join(root, "outputs")

  try {
    await createFixture(packageRoot)
    await linkPackage(repository, "@internal/visual", packageRoot)
    const mockedPaths = {
      cosmosRoot: cosmos,
      cosmosManifest: join(cosmos, "package.json"),
    }
    mock.module(import.meta.resolve("../../release/server/shared/paths"), () => mockedPaths)
    mock.module(import.meta.resolve("../../release/server/shared/paths.ts"), () => mockedPaths)

    const {buildPackage} = await import("../../release/server/package/build")
    const optionScenario = process.env.PACKAGE_MULTI_OPTIONS ?? "valid"
    const buildOptions = optionScenario === "missing-version"
      ? {env: "main" as const, outdir}
      : optionScenario === "artifact-combination"
        ? {env: "main" as const, artifact: join(root, "visual.js"), outdir, version: "1.0.1"}
        : optionScenario === "invalid-version"
          ? {env: "main" as const, outdir, version: "01.0.1"}
          : {env: "main" as const, outdir, version: "1.0.1"}
    let result
    try {
      result = await buildPackage("@internal/visual", buildOptions)
    } catch (error) {
      result = {
        success: false,
        exitCode: null,
        stderr: error instanceof Error ? error.message : String(error),
        outputs: [],
      }
    }
    const outputs = await Promise.all(result.outputs.map(async (output) => {
      const source = await Bun.file(output.path).text().catch(() => "")
      return {
        artifact: output.artifact,
        kind: output.kind,
        load: output.load,
        path: output.path,
        type: output.type,
        sourceMapFor: output.sourceMapFor,
        source: source.slice(0, 2_000),
        inlineMap: source.includes("sourceMappingURL=data:"),
      }
    }))
    console.log(JSON.stringify({
      success: result.success,
      exitCode: result.exitCode,
      stderr: result.stderr,
      outdir,
      outputs,
      files: await Array.fromAsync(new Bun.Glob("**/*").scan({cwd: outdir, onlyFiles: true}))
        .catch(() => []),
    }))
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

async function createFixture(packageRoot: string) {
  const usePlugin = process.env.PACKAGE_MULTI_PLUGIN !== "none"
  const collision = process.env.PACKAGE_MULTI_EXPORT_COLLISION === "1"
  await Promise.all([
    writeJson(join(packageRoot, "package.json"), {
      name: "@internal/visual",
      version: "1.0.0",
      private: true,
      type: "module",
      exports: {
        ".": {"internal:main": "./main/index.ts"},
        "./component-a": {"internal:main": "./main/component-a.ts"},
        ...(collision
          ? {"./component-a.js": {"internal:main": "./main/component-a-alias.ts"}}
          : {}),
        "./component-b": {"internal:main": usePlugin
          ? "./main/component-b.tsx"
          : "./main/component-b.ts"},
        "./theme.css": {"internal:main": "./theme.css"},
        "./kernel.wasm": {"internal:main": "./kernel.wasm"},
      },
      scripts: {
        typecheck: "bun -e ''",
        "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --external=@fixture/external --production --minify --drop console.debug --outdir=dist/main --splitting",
      },
    }),
    ...(usePlugin ? [writeSource(join(packageRoot, "bunfig.toml"), [
        "[cosmos.package-build.environments.main]",
        'plugins = ["./build/plugin.ts"]',
        "",
      ].join("\n"))] : []),
    writeSource(join(packageRoot, "main/index.ts"), [
      'import {shared} from "./shared.ts"',
      'import external from "@fixture/external"',
      "export const themeUrl = `/@internal/visual/theme.css?env=${import.meta.env.COSMOS_PACKAGE_ENV}&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`",
      "export const identity = `${import.meta.env.COSMOS_PACKAGE_NAME}:${shared}`",
      "export const externalValue = external",
      "",
    ].join("\n")),
    writeSource(join(packageRoot, "main/component-a.ts"), [
      'import {shared} from "./shared.ts"',
      "export const componentA = `a:${shared}`",
      "",
    ].join("\n")),
    ...(collision ? [writeSource(
      join(packageRoot, "main/component-a-alias.ts"),
      'export const alias = "collision"\n',
    )] : []),
    writeSource(join(packageRoot, usePlugin ? "main/component-b.tsx" : "main/component-b.ts"), [
      usePlugin
        ? "export const componentB = <button>Visual</button>"
        : 'export const componentB = "plain-button"',
      "",
    ].join("\n")),
    writeSource(join(packageRoot, "main/shared.ts"), `export const shared = ${JSON.stringify("shared-".repeat(2048))}\n`),
    writeSource(join(packageRoot, "theme.css"), ":root { --fixture-color: red; }\n"),
    writeSource(join(packageRoot, "kernel.wasm"), "fixture-wasm-bytes"),
    writeSource(join(packageRoot, "build/plugin.ts"), [
      "export default {",
      '  name: "fixture-compiled-tsx",',
      "  setup(build) {",
      "    build.onLoad({filter: /\\.tsx$/}, async ({path}) => {",
      "      const authored = await Bun.file(path).text()",
      "      if (!authored.includes(\"<button>Visual</button>\")) throw new Error(\"Fixture TSX is missing\")",
      '      return {contents: \'import {shared} from "./shared.ts"; export const componentB = `compiled-button:${shared}`\\n\', loader: "js"}',
      "    })",
      "  },",
      "}",
      "",
    ].join("\n")),
  ])
}

async function linkPackage(repository: string, name: string, target: string) {
  const path = join(repository, "node_modules", ...name.split("/"))
  await mkdir(dirname(path), {recursive: true})
  await symlink(target, path)
}

async function writeJson(path: string, value: unknown) {
  await writeSource(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeSource(path: string, source: string) {
  await mkdir(dirname(path), {recursive: true})
  await Bun.write(path, source)
}
