import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, stat, symlink} from "node:fs/promises"
import {dirname, join} from "node:path"
import {tmpdir} from "node:os"

const scenario = process.env.ARTIFACT_PUBLICATION_SCENARIO ?? "publish"

test("multi-output publication fixture", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "metafor-artifact-publication-")))
  const repository = join(root, "repository")
  const cosmos = join(repository, "cosmos")
  const packageRoot = join(cosmos, "internal/fixture")

  try {
    await createWorkspace(cosmos, packageRoot)
    await linkPackage(repository, "@internal/fixture", packageRoot)
    const mockedPaths = {
      cosmosRoot: cosmos,
      cosmosManifest: join(cosmos, "package.json"),
    }
    mock.module(import.meta.resolve("../../release/server/shared/paths"), () => mockedPaths)
    mock.module(import.meta.resolve("../../release/server/shared/paths.ts"), () => mockedPaths)

    const {publishPackages, recoverPublication} = await import("../../release/server/release/publication")
    const {readDesiredBrowserArtifacts, replaceDesiredBrowserArtifacts} = await import(
      "../../release/server/release/desired"
    )
    const publication = await publishPackages([{name: "@internal/fixture", change: "patch"}])
    if (!publication.success) throw new Error(`Fixture publication failed: ${JSON.stringify(publication)}`)
    const outputs = publication.results.flatMap(({outputs}) => outputs)
    const mainRoot = publication.results.find(({env}) => env === "main")!
      .outputs.find(({artifact, kind}) => artifact === "." && kind !== "sourcemap")!
    const themePublic = outputs.find(({artifact}) => artifact === "./theme.css")!
    const themeGenerated = outputs.find(({artifact, path}) =>
      artifact?.startsWith("./.cosmos/entry/") && path !== themePublic.path)!
    const wasmOutputs = publication.results.map((result) =>
      result.outputs.find(({artifact}) => artifact === "./kernel.wasm")!)
    const wasm = wasmOutputs[0]!
    const publicStat = await stat(themePublic.path, {bigint: true})
    const generatedStat = await stat(themeGenerated.path, {bigint: true})
    const wasmStats = await Promise.all(wasmOutputs.map(({path}) => stat(path, {bigint: true})))
    const desiredAfterPublish = readDesiredBrowserArtifacts()

    let recoveryError: string | null = null
    let repaired = false
    let predecessorPublicStatus: number | null = null
    let predecessorPublicSource: string | null = null
    let stableRemovedStatus: number | null = null
    let canonicalRootExists: boolean | null = null
    let legacyRootSource: string | null = null
    let predecessorEnvRootStatus: number | null = null
    let predecessorEnvPublicStatus: number | null = null
    let stableRemovedEnvStatus: number | null = null
    if (scenario === "recover-missing" || scenario === "recover-missing-generated") {
      const missing = scenario === "recover-missing-generated" ? themeGenerated : wasm
      await rm(missing.path, {force: true})
      replaceDesiredBrowserArtifacts([])
      await recoverPublication()
      repaired = await Bun.file(missing.path).exists()
    } else if (scenario === "recover-conflict") {
      await Bun.write(wasm.path, "corrupt-wasm")
      replaceDesiredBrowserArtifacts([])
      try {
        await recoverPublication()
      } catch (error) {
        recoveryError = error instanceof Error ? error.message : String(error)
      }
    } else if (scenario === "recover-path-conflict") {
      const manifestPath = join(packageRoot, "package.json")
      const manifest = await Bun.file(manifestPath).json() as {
        exports: Record<string, unknown>
      }
      manifest.exports["./theme.css"] = {"internal:main": "./theme.ts"}
      await writeJson(manifestPath, manifest)
      await writeSource(join(packageRoot, "theme.ts"), "export default 'theme'\n")
      replaceDesiredBrowserArtifacts([])
      try {
        await recoverPublication()
      } catch (error) {
        recoveryError = error instanceof Error ? error.message : String(error)
      }
    } else if (scenario === "recover-legacy-root" || scenario === "recover-legacy-root-conflict") {
      const {packageOwner} = await import("../../release/server/package/manifest")
      const {versionedArtifact} = await import("../../release/server/release/state")
      const owner = await packageOwner("@internal/fixture", "main")
      const legacy = versionedArtifact(owner.artifact, "1.0.1")
      await mkdir(dirname(legacy), {recursive: true})
      await Bun.write(legacy, scenario === "recover-legacy-root"
        ? Bun.file(mainRoot.path)
        : "conflicting legacy root")
      await rm(mainRoot.path, {force: true})
      replaceDesiredBrowserArtifacts([])
      try {
        await recoverPublication()
      } catch (error) {
        recoveryError = error instanceof Error ? error.message : String(error)
      }
      canonicalRootExists = await Bun.file(mainRoot.path).exists()
      legacyRootSource = await Bun.file(legacy).text()
    } else if (scenario === "predecessor-public" || scenario === "predecessor-env") {
      const manifestPath = join(packageRoot, "package.json")
      const manifest = await Bun.file(manifestPath).json() as {
        exports: Record<string, unknown>
        scripts: Record<string, string>
      }
      if (scenario === "predecessor-public") {
        delete manifest.exports["./theme.css"]
        manifest.scripts["build:main"] = "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outfile=dist/main.js"
      } else {
        manifest.exports["."] = {
          "internal:worker": "./worker/index.ts",
          "internal:server": "./server/index.ts",
        }
        manifest.exports["./theme.css"] = {"internal:worker": "./theme.css"}
        delete manifest.scripts["build:main"]
        manifest.scripts["build:worker"] = "bun build ./worker/index.ts --conditions=internal:worker --target=browser --production --minify --drop console.debug --outdir=dist/worker --splitting"
      }
      await writeJson(manifestPath, manifest)
      const nextEnvironment = scenario === "predecessor-public" ? "main" : "worker"
      await writeSource(join(packageRoot, `${nextEnvironment}/index.ts`), scenario === "predecessor-public"
        ? ["export const identity = import.meta.env.COSMOS_PACKAGE_NAME", ""].join("\n")
        : [
            "export const themeUrl = `/@internal/fixture/theme.css?env=${import.meta.env.COSMOS_PACKAGE_ENV}&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`",
            "export const identity = import.meta.env.COSMOS_PACKAGE_NAME",
            "",
          ].join("\n"))
      const second = await publishPackages([{name: "@internal/fixture", change: "patch"}])
      if (!second.success) throw new Error(`Second fixture publication failed: ${JSON.stringify(second)}`)
      const {releasedPackageArtifactResponse, releasedPackageResponse} = await import(
        "../../release/server/release/state"
      )
      const predecessor = await releasedPackageArtifactResponse(
        "@internal/fixture",
        "main",
        "./theme.css",
        "1.0.1",
      )
      const stable = await releasedPackageArtifactResponse(
        "@internal/fixture",
        "main",
        "./theme.css",
        null,
      )
      predecessorPublicStatus = predecessor.status
      predecessorPublicSource = await predecessor.text()
      stableRemovedStatus = stable.status
      if (scenario === "predecessor-env") {
        predecessorEnvRootStatus = (await releasedPackageResponse(
          "@internal/fixture",
          "main",
          "1.0.1",
        )).status
        predecessorEnvPublicStatus = predecessor.status
        stableRemovedEnvStatus = (await releasedPackageResponse(
          "@internal/fixture",
          "main",
          null,
        )).status
      }
    }
    const publicAfter = await stat(themePublic.path, {bigint: true})
    const generatedAfter = await stat(themeGenerated.path, {bigint: true})

    console.log(JSON.stringify({
      success: publication.success,
      outputs: publication.results.flatMap((result) =>
        result.outputs.map(({artifact, kind, load, path, sha256, size}) => ({
          env: result.env,
          artifact,
          kind,
          load,
          path,
          sha256,
          size,
        }))),
      desiredAfterPublish,
      desiredAfterRecovery: readDesiredBrowserArtifacts(),
      hardlinked: publicStat.dev === generatedStat.dev && publicStat.ino === generatedStat.ino,
      hardlinkedAfterRecovery: publicAfter.dev === generatedAfter.dev
        && publicAfter.ino === generatedAfter.ino,
      sharedWasmHardlinked: wasmStats.every(({dev, ino}) =>
        dev === wasmStats[0]!.dev && ino === wasmStats[0]!.ino),
      repaired,
      recoveryError,
      predecessorPublicStatus,
      predecessorPublicSource,
      stableRemovedStatus,
      canonicalRootExists,
      legacyRootSource,
      predecessorEnvRootStatus,
      predecessorEnvPublicStatus,
      stableRemovedEnvStatus,
      wasm: await Bun.file(wasm.path).text().catch(() => ""),
      packageVersion: (await Bun.file(join(packageRoot, "package.json")).json() as {version: string}).version,
      rootDependency: (await Bun.file(join(cosmos, "package.json")).json() as {
        dependencies: Record<string, string>
      }).dependencies["@internal/fixture"],
    }))
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

async function createWorkspace(cosmos: string, packageRoot: string) {
  await Promise.all([
    writeJson(join(cosmos, "package.json"), {
      name: "@metafor/cosmos-fixture",
      private: true,
      dependencies: {"@internal/fixture": "workspace:^1.0.0"},
    }),
    writeJson(join(packageRoot, "package.json"), {
      name: "@internal/fixture",
      version: "1.0.0",
      private: true,
      type: "module",
      exports: {
        ".": {
          "internal:main": "./main/index.ts",
          "internal:server": "./server/index.ts",
        },
        "./theme.css": {"internal:main": "./theme.css"},
        "./kernel.wasm": "./kernel.wasm",
      },
      scripts: {
        typecheck: "bun -e ''",
        "build:main": "bun build ./main/index.ts --conditions=internal:main --target=browser --production --minify --drop console.debug --outdir=dist/main --splitting",
        "build:server": "bun build ./server/index.ts --conditions=internal:server --target=bun --production --minify --drop console.debug --outfile=dist/server.js",
      },
    }),
    writeSource(join(packageRoot, "main/index.ts"), [
      "export const themeUrl = `/@internal/fixture/theme.css?env=${import.meta.env.COSMOS_PACKAGE_ENV}&version=${import.meta.env.COSMOS_PACKAGE_VERSION}`",
      "export const identity = import.meta.env.COSMOS_PACKAGE_NAME",
      "",
    ].join("\n")),
    writeSource(join(packageRoot, "server/index.ts"), 'export const server = true\n'),
    writeSource(join(packageRoot, "theme.css"), ":root { --fixture: red; }\n"),
    writeSource(join(packageRoot, "kernel.wasm"), "fixture-wasm-v1"),
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
