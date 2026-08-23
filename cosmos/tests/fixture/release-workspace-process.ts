import {mock, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm, stat, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"

const scenario = process.env.RELEASE_FIXTURE_SCENARIO
let root = ""
let repository = ""
let hamiltonian = ""
let proof = ""
const targetVersion = "1.0.1"

test("release workspace fixture", async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "metafor-release-fixture-")))
  repository = join(root, "repository")
  hamiltonian = join(repository, "hamiltonian")
  proof = join(root, "typecheck.log")

  try {
    await createWorkspace()
    const mockedPaths = {
      hamiltonianRoot: hamiltonian,
      hamiltonianManifest: join(hamiltonian, "package.json"),
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
    if (resolvedPaths.hamiltonianRoot !== hamiltonian)
      throw new Error(`Release paths fixture was not installed: ${resolvedPaths.hamiltonianRoot}`)

    if (isRecoveryScenario()) await prepareRecoveryArtifacts()
    if (scenario === "conflicting-recovery") {
      await writeSource(
        join(hamiltonian, "release", "main", "index.ts"),
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
      console.log(JSON.stringify({
        root,
        error,
        recovered: result?.recovered ?? [],
        rewritten: Object.keys(before).filter((path) => after[path] !== before[path]),
        artifacts: (result?.artifacts ?? []).map(({path, sha256, size}) => ({
          path: path.slice(hamiltonian.length),
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
          packages: [{name: "@hamiltonian/release", change: "patch"}],
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
        "https://fixture.test/@hamiltonian/release?env=main",
      ))
      const missing = await getPackage(new Request(
        "https://fixture.test/@internal/missing?env=main&version=1.0.1",
      ))
      console.log(JSON.stringify({
        root,
        delivered: delivered.status,
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
    writeJson(join(hamiltonian, "package.json"), {
      name: "@metafor/hamiltonian-fixture",
      private: true,
      dependencies: {
        "@hamiltonian/release": `workspace:^${targetVersion}`,
        "@internal/visual": `workspace:^${targetVersion}`,
      },
    }),
    createPackage("release", {
      name: "@hamiltonian/release",
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
    linkPackage("@hamiltonian/release", join(hamiltonian, "release")),
    linkPackage("@internal/visual", join(hamiltonian, "internal/visual")),
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
  await writeJson(join(hamiltonian, path, "package.json"), {
    name: fixture.name,
    version: fixture.version,
    type: "module",
    exports: {".": exports},
    scripts: {typecheck: fixture.typecheck, ...scripts},
    dependencies: fixture.dependencies,
  })
  await Promise.all(fixture.environments.map((env) => writeSource(
    join(hamiltonian, path, env, "index.ts"),
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
  await writeSource(
    join(hamiltonian, path, "dist", "versions", version, `${env}.js`),
    `export const fixture = ${JSON.stringify(`${path}:${env}@${version}`)}\n`,
  )
}

async function prepareRecoveryArtifacts() {
  const {buildPackage} = await import("../../release/server/package/build")
  const composition: Array<readonly [string, string, "main" | "service" | "server"]> = [
    ["@hamiltonian/release", "release", "main"],
    ["@hamiltonian/release", "release", "service"],
    ["@hamiltonian/release", "release", "server"],
    ["@internal/visual", "internal/visual", "main"],
    ["@internal/visual", "internal/visual", "server"],
  ]
  const artifacts = composition.flatMap((artifact, index) =>
    scenario === "cold-recovery" && artifact[0] === "@hamiltonian/release"
      ? []
      : [{artifact, index}])

  const results = await Promise.all(artifacts.map(({artifact: [name, , env], index}) => buildPackage(name, {
    env,
    artifact: join(hamiltonian, ".fixture-publication", `${index}.js`),
  })))
  const failure = results.find(({success}) => !success)
  if (failure) throw new Error(`Fixture preparation failed: ${failure.stderr}`)
  await Promise.all(artifacts.map(async ({artifact: [, path, env], index}) => writeSource(
    join(hamiltonian, path, "dist", "versions", targetVersion, `${env}.js`),
    await Bun.file(join(hamiltonian, ".fixture-publication", `${index}.js`)).arrayBuffer(),
  )))
}

function isRecoveryScenario() {
  return scenario === "cold-recovery"
    || scenario === "converged-recovery"
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
  return Object.fromEntries((await Promise.all(artifacts.map(async ([path, env]) => {
    const artifact = join(hamiltonian, path, "dist", "versions", targetVersion, `${env}.js`)
    if (!await Bun.file(artifact).exists()) return null
    const state = await stat(artifact, {bigint: true})
    return [artifact, `${state.dev}:${state.ino}:${state.mtimeNs}:${state.size}`] as const
  }))).filter((entry) => entry !== null))
}

async function writeJson(path: string, value: unknown) {
  await writeSource(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeSource(path: string, source: string | ArrayBuffer) {
  await mkdir(dirname(path), {recursive: true})
  await Bun.write(path, source)
}
