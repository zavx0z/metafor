import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, stat, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"

const scenario = process.env.RELEASE_FIXTURE_SCENARIO
let root = ""
let repository = ""
let cosmos = ""
let proof = ""
const targetVersion = "1.0.1"

test("release workspace fixture", async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "metafor-release-fixture-")))
  repository = join(root, "repository")
  cosmos = join(repository, "cosmos")
  proof = join(root, "typecheck.log")

  try {
    await createWorkspace()
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
    const resolvedPaths = await import("../../release/server/shared/paths")
    if (resolvedPaths.cosmosRoot !== cosmos)
      throw new Error(`Release paths fixture was not installed: ${resolvedPaths.cosmosRoot}`)

    if (isRecoveryScenario()) await prepareRecoveryArtifacts()
    let documentationDrift: {javascript: boolean; sourceMap: boolean} | null = null
    let missingSourceMap: {restored: boolean; matchesStaged: boolean} | null = null
    if (scenario === "documentation-recovery") {
      await writeSource(
        join(cosmos, "release", "main", "index.ts"),
        '/**\nDocumentation-only fixture comment.\n*/\nexport const environment = "main"\n',
      )
      documentationDrift = await measureDocumentationDrift()
    }
    if (scenario === "missing-map-recovery") {
      await rm(recoverySourceMap(), {force: true})
    }
    if (scenario === "conflicting-recovery") {
      await writeSource(
        join(cosmos, "release", "main", "index.ts"),
        'export const environment = "changed"\n',
      )
    }

    if (scenario === "parallel-typecheck" || scenario === "failed-typecheck") {
      const {buildPackage} = await import("../../release/server/package/build")
      const outputs = [join(root, "main.js"), join(root, "server.js")] as const
      const results = await Promise.all([
        buildPackage("@internal/visual", {env: "main", artifact: outputs[0]}),
        buildPackage("@internal/visual", {env: "server", artifact: outputs[1]}),
      ])
      const proofSource = await Bun.file(proof).text().catch(() => "")
      console.log(JSON.stringify({
        root,
        results: results.map(({success, exitCode, outputs: artifacts}) => ({
          success,
          exitCode,
          outputs: artifacts.length,
        })),
        typechecks: proofSource.trim() === "" ? 0 : proofSource.trim().split("\n").length,
        artifacts: await Promise.all(outputs.map((path) => Bun.file(path).exists())),
      }))
    } else if (
      scenario === "cold-recovery"
      || scenario === "converged-recovery"
      || scenario === "documentation-recovery"
      || scenario === "missing-map-recovery"
      || scenario === "conflicting-recovery"
    ) {
      const {recoverPublication} = await import("../../release/server/release/publication")
      const before = await artifactStamps()
      let result: Awaited<ReturnType<typeof recoverPublication>> | null = null
      let error: string | null = null
      console.log("=== recovery under test ===")
      try {
        result = await recoverPublication()
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      }
      const after = await artifactStamps()
      if (scenario === "missing-map-recovery") {
        missingSourceMap = {
          restored: await Bun.file(recoverySourceMap()).exists(),
          matchesStaged: await equalFiles(recoverySourceMap(), stagedRecoverySourceMap()),
        }
      }
      console.log(JSON.stringify({
        root,
        error,
        recovered: result?.recovered ?? [],
        rewritten: Object.keys(before).filter((path) => after[path] !== before[path]),
        documentationDrift,
        missingSourceMap,
        artifacts: (result?.artifacts ?? []).map(({path, sha256, size}) => ({
          path: path.slice(cosmos.length),
          sha256,
          size,
        })),
      }))
    } else if (scenario === "publication" || scenario === "failed-publication") {
      const {publishRelease} = await import("../../release/server/release/update")
      const notifications: string[] = []
      const response = await publishRelease(new Request("https://fixture.test/code", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          packages: [{name: "@cosmos/release", change: "patch"}],
        }),
      }), {
        topic: "release/service",
        subscriberCount: () => 1,
        publish(message) {
          notifications.push(message)
          return 1
        },
      })
      console.log(JSON.stringify({
        root,
        status: response.status,
        body: await response.json(),
        notifications,
      }))
    } else if (scenario === "delivery") {
      const {getPackage} = await import("../../release/server/http/delivery")
      const delivered = await getPackage(new Request(
        "https://fixture.test/@cosmos/release?env=main",
      ))
      const sourceMapUrl = delivered.headers.get("SourceMap")
      const sourceMap = sourceMapUrl
        ? await getPackage(new Request(new URL(sourceMapUrl, "https://fixture.test"), {
            headers: {"Accept-Encoding": "br"},
          }))
        : new Response(null, {status: 404})
      const missing = await getPackage(new Request(
        "https://fixture.test/@internal/missing?env=main&version=1.0.1",
      ))
      console.log(JSON.stringify({
        root,
        delivered: delivered.status,
        sourceMap: sourceMap.status,
        sourceMapEncoding: sourceMap.headers.get("Content-Encoding"),
        missing: missing.status,
      }))
    } else {
      throw new Error(`Unknown release fixture scenario ${String(scenario)}`)
    }
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

async function createWorkspace() {
  const typecheck = scenario === "failed-typecheck"
    ? "bun -e 'process.exit(17)'"
    : scenario === "parallel-typecheck"
      ? `bun -e 'import {appendFileSync} from "node:fs"; appendFileSync(${JSON.stringify(proof)}, "checked\\n")'`
      : isRecoveryScenario() || scenario === "publication"
        ? "bun -e ''"
        : scenario === "failed-publication"
          ? "bun -e 'process.exit(17)'"
          : "bun -e 'process.exit(19)'"

  await Promise.all([
    writeJson(join(cosmos, "package.json"), {
      name: "@metafor/cosmos-fixture",
      private: true,
      dependencies: {
        "@cosmos/release": `workspace:^${targetVersion}`,
        "@internal/visual": `workspace:^${targetVersion}`,
      },
    }),
    createPackage("release", {
      name: "@cosmos/release",
      version: targetVersion,
      typecheck,
      dependencies: {"@internal/visual": `workspace:^${targetVersion}`},
      environments: ["main", "service", "server"],
    }),
    createPackage("internal/visual", {
      name: "@internal/visual",
      version: targetVersion,
      typecheck,
      dependencies: {},
      environments: ["main", "server"],
    }),
  ])

  await Promise.all([
    linkPackage("@cosmos/release", join(cosmos, "release")),
    linkPackage("@internal/visual", join(cosmos, "internal/visual")),
  ])

  if (
    scenario === "publication"
    || scenario === "failed-publication"
    || scenario === "delivery"
  ) {
    const artifacts: Array<readonly [string, string]> = [
      ["internal/visual", "main"],
      ["internal/visual", "server"],
      ["release", "main"],
      ["release", "service"],
      ["release", "server"],
    ]
    await Promise.all(artifacts.map(([path, env]) => writeArtifact(path, targetVersion, env)))
  }
}

async function createPackage(
  path: string,
  fixture: {
    name: string
    version: string
    typecheck: string
    dependencies: Record<string, string>
    environments: Array<"main" | "service" | "server">
  },
) {
  const scope = fixture.name.slice(1, fixture.name.indexOf("/"))
  const exports = Object.fromEntries(fixture.environments.map((env) => [
    `${scope}:${env}`,
    `./${env}/index.ts`,
  ]))
  const scripts = Object.fromEntries(fixture.environments.map((env) => [
    `build:${env}`,
    buildCommand(scope, env),
  ]))
  await writeJson(join(cosmos, path, "package.json"), {
    name: fixture.name,
    version: fixture.version,
    type: "module",
    exports: {".": exports},
    scripts: {typecheck: fixture.typecheck, ...scripts},
    dependencies: fixture.dependencies,
  })
  await Promise.all(fixture.environments.map((env) => writeSource(
    join(cosmos, path, env, "index.ts"),
    `export const environment = ${JSON.stringify(env)}\n`,
  )))
}

function buildCommand(scope: string, env: "main" | "service" | "server") {
  const target = env === "main" || env === "service" ? "browser" : "bun"
  const format = env === "service" ? " --format=cjs" : ""
  return `bun build ./${env}/index.ts --conditions=${scope}:${env} --target=${target}${format} --production --minify --drop console.debug --outfile=dist/${env}.js`
}

async function linkPackage(name: string, target: string) {
  const path = join(repository, "node_modules", ...name.split("/"))
  await mkdir(dirname(path), {recursive: true})
  await symlink(target, path)
}

async function writeArtifact(path: string, version: string, env: string) {
  const artifact = join(cosmos, path, "dist", "versions", version, `${env}.js`)
  await Promise.all([
    writeSource(artifact, `export const fixture = ${JSON.stringify(`${path}:${env}@${version}`)}\n`),
    writeSource(`${artifact}.map`, JSON.stringify({version: 3, sources: [`${env}/index.ts`], mappings: ""})),
  ])
}

async function prepareRecoveryArtifacts() {
  const {buildPackage} = await import("../../release/server/package/build")
  const composition: Array<readonly [string, string, "main" | "service" | "server"]> = [
    ["@cosmos/release", "release", "main"],
    ["@cosmos/release", "release", "service"],
    ["@cosmos/release", "release", "server"],
    ["@internal/visual", "internal/visual", "main"],
    ["@internal/visual", "internal/visual", "server"],
  ]
  const artifacts = composition.flatMap((artifact, index) =>
    scenario === "cold-recovery" && artifact[0] === "@cosmos/release"
      ? []
      : [{artifact, index}])

  const results = await Promise.all(artifacts.map(({artifact: [name, , env], index}) => buildPackage(name, {
    env,
    artifact: join(cosmos, ".fixture-publication", `${index}.js`),
  })))
  const failure = results.find(({success}) => !success)
  if (failure) throw new Error(`Fixture preparation failed: ${failure.stderr}`)
  await Promise.all(artifacts.flatMap(({artifact: [, path, env], index}) => {
    const staged = join(cosmos, ".fixture-publication", `${index}.js`)
    const published = join(cosmos, path, "dist", "versions", targetVersion, `${env}.js`)
    return [
      writeSource(published, Bun.file(staged).arrayBuffer()),
      writeSource(`${published}.map`, Bun.file(`${staged}.map`).arrayBuffer()),
    ]
  }))
}

function isRecoveryScenario() {
  return scenario === "cold-recovery"
    || scenario === "converged-recovery"
    || scenario === "documentation-recovery"
    || scenario === "missing-map-recovery"
    || scenario === "conflicting-recovery"
}

async function artifactStamps() {
  const artifacts: Array<readonly [string, string]> = [
    ["release", "main"],
    ["release", "service"],
    ["release", "server"],
    ["internal/visual", "main"],
    ["internal/visual", "server"],
  ]
  const paths = artifacts.flatMap(([path, env]) => {
    const artifact = join(cosmos, path, "dist", "versions", targetVersion, `${env}.js`)
    return [artifact, `${artifact}.map`]
  })
  return Object.fromEntries((await Promise.all(paths.map(async (path) => {
    if (!await Bun.file(path).exists()) return null
    const state = await stat(path, {bigint: true})
    return [path, `${state.dev}:${state.ino}:${state.mtimeNs}:${state.size}`] as const
  }))).filter((entry) => entry !== null))
}

async function measureDocumentationDrift() {
  const {buildPackage} = await import("../../release/server/package/build")
  const {packageArtifact} = await import("../../release/server/package/manifest")
  const result = await buildPackage("@cosmos/release", {
    env: "main",
    artifact: join(cosmos, ".fixture-publication", "0.js"),
  })
  if (!result.success) throw new Error(`Documentation drift build failed: ${result.stderr}`)

  const exactArtifact = await packageArtifact(join(
    cosmos,
    "release",
    "dist",
    "versions",
    targetVersion,
    "main.js",
  ))
  const exactSourceMap = await packageArtifact(recoverySourceMap())
  if (!exactArtifact || !exactSourceMap)
    throw new Error("Documentation drift exact artifacts are missing")
  return {
    javascript: result.outputs[0]?.sha256 !== exactArtifact.sha256,
    sourceMap: result.outputs[1]?.sha256 !== exactSourceMap.sha256,
  }
}

function recoverySourceMap() {
  return join(
    cosmos,
    "release",
    "dist",
    "versions",
    targetVersion,
    "main.js.map",
  )
}

function stagedRecoverySourceMap() {
  return join(cosmos, ".fixture-publication", "0.js.map")
}

async function equalFiles(left: string, right: string) {
  const [leftSource, rightSource] = await Promise.all([
    Bun.file(left).arrayBuffer(),
    Bun.file(right).arrayBuffer(),
  ])
  const leftHash = new Bun.CryptoHasher("sha256").update(leftSource).digest("hex")
  const rightHash = new Bun.CryptoHasher("sha256").update(rightSource).digest("hex")
  return leftHash === rightHash
}

async function writeJson(path: string, value: unknown) {
  await writeSource(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeSource(path: string, source: string | ArrayBuffer | Promise<ArrayBuffer>) {
  await mkdir(dirname(path), {recursive: true})
  await Bun.write(path, await source)
}
