import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"

const pluginExport = process.env.PACKAGE_PLUGIN_EXPORT ?? "valid"

test("package plugin build fixture", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-package-plugin-")))
  const repository = join(root, "repository")
  const cosmos = join(repository, "cosmos")
  const packageRoot = join(cosmos, "internal/visual")
  const artifact = join(root, "visual.js")

  try {
    await createFixture(packageRoot)
    await linkPackage(repository, "@internal/visual", packageRoot)

    const mockedPaths = {
      cosmosRoot: cosmos,
      cosmosManifest: join(cosmos, "package.json"),
    }
    mock.module(
      import.meta.resolve("../../release/server/shared/paths"),
      () => mockedPaths,
    )
    mock.module(
      import.meta.resolve("../../release/server/shared/paths.ts"),
      () => mockedPaths,
    )

    const {buildPackage} = await import("../../release/server/package/build")
    const result = await buildPackage("@internal/visual", {env: "main", artifact})
    const source = await Bun.file(artifact).text().catch(() => "")
    const sourceMap = await Bun.file(`${artifact}.map`).text().catch(() => "")
    console.log(JSON.stringify({
      success: result.success,
      exitCode: result.exitCode,
      stderr: result.stderr,
      outputs: result.outputs.length,
      compiled: source.includes("compiled-button") && source.includes("fixture-shader"),
      debug: source.includes("fixture-debug"),
      inlineMap: source.includes("sourceMappingURL=data:"),
      sourceMap: sourceMap.length > 0,
      runtimeJsx: /jsx-runtime|jsxDEV|createElement|<button/.test(source),
    }))
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

async function createFixture(packageRoot: string) {
  await Promise.all([
    writeJson(join(packageRoot, "package.json"), {
      name: "@internal/visual",
      version: "1.0.0",
      private: true,
      type: "module",
      exports: {".": {"internal:main": "./main/index.ts"}},
      scripts: {
        typecheck: "bun -e ''",
        "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outfile=dist/main.js",
      },
    }),
    writeSource(join(packageRoot, "bunfig.toml"), [
      "[loader]",
      '".fixture" = "text"',
      "",
      "[cosmos.package-build.environments.main]",
      'plugins = ["./build/plugin.ts"]',
      "",
    ].join("\n")),
    writeSource(join(packageRoot, "main/index.ts"), [
      'import {view} from "./view.tsx"',
      'import shader from "./shader.fixture"',
      'console.debug("fixture-debug")',
      "export const rendered = `${view}:${shader}`",
      "",
    ].join("\n")),
    writeSource(join(packageRoot, "main/shader.fixture"), "fixture-shader\n"),
    writeSource(join(packageRoot, "main/view.tsx"), [
      "export const view = <button>Visual</button>",
      "",
    ].join("\n")),
    writeSource(
      join(packageRoot, "build/plugin.ts"),
      pluginExport === "valid"
        ? [
            "export default {",
            '  name: "fixture-compiled-tsx",',
            "  setup(build) {",
            "    build.onLoad({filter: /\\.tsx$/}, async ({path}) => {",
            "      const authored = await Bun.file(path).text()",
            "      if (!authored.includes(\"<button>Visual</button>\")) throw new Error(\"Fixture TSX is missing\")",
            '      return {contents: \'export const view = "compiled-button"\\n\', loader: "js"}',
            "    })",
            "  },",
            "}",
            "",
          ].join("\n")
        : pluginExport === "mutating"
          ? [
              "export default {",
              '  name: "fixture-mutating-build",',
              "  setup(build) {",
              '    build.config.entrypoints = ["./main/other.ts"]',
              "  },",
              "}",
              "",
            ].join("\n")
          : pluginExport === "mutating-output"
            ? [
                "export default {",
                '  name: "fixture-mutating-output",',
                "  setup(build) {",
                "    build.onLoad({filter: /\\.tsx$/}, () => ({contents: 'export const view = \"compiled-button\"', loader: \"js\"}))",
                "    build.onEnd((result) => { result.outputs.length = 0 })",
                "  },",
                "}",
                "",
              ].join("\n")
          : "export default 42\n",
    ),
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
