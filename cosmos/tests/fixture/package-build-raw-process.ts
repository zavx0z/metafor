import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"

test("root plus raw publication-shaped package build", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-package-raw-")))
  const repository = join(root, "repository")
  const cosmos = join(repository, "cosmos")
  const packageRoot = join(cosmos, "internal/raw")
  const outdir = join(root, "staging")

  try {
    await Promise.all([
      writeJson(join(packageRoot, "package.json"), {
        name: "@internal/raw",
        version: "1.0.0",
        private: true,
        type: "module",
        exports: {
          ".": {"internal:main": "./main/index.ts"},
          "./kernel.wasm": {"internal:main": "./kernel.wasm"},
        },
        scripts: {
          typecheck: "bun -e ''",
          "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outfile=dist/main.js",
        },
      }),
      writeSource(join(packageRoot, "main/index.ts"), 'export const ready = true\n'),
      writeSource(join(packageRoot, "kernel.wasm"), "raw-wasm-v1"),
    ])
    await linkPackage(repository, "@internal/raw", packageRoot)
    const mockedPaths = {
      cosmosRoot: cosmos,
      cosmosManifest: join(cosmos, "package.json"),
    }
    mock.module(import.meta.resolve("../../release/server/shared/paths"), () => mockedPaths)
    mock.module(import.meta.resolve("../../release/server/shared/paths.ts"), () => mockedPaths)

    const {buildPackage} = await import("../../release/server/package/build")
    const result = await buildPackage("@internal/raw", {
      env: "main",
      outdir,
      version: "1.0.1",
    })
    console.log(JSON.stringify({
      success: result.success,
      exitCode: result.exitCode,
      stderr: result.stderr,
      outdir,
      outputs: result.outputs.map(({artifact, kind, load, path, type}) => ({
        artifact,
        kind,
        load,
        path,
        type,
      })),
      wasm: await Bun.file(result.outputs.find(({artifact}) => artifact === "./kernel.wasm")?.path ?? "")
        .text().catch(() => ""),
    }))
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

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
