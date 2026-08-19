import {expect, setDefaultTimeout, test} from "bun:test"
import {existsSync} from "node:fs"
import {mkdtemp, rm, symlink} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {
  buildablePackage,
  packageBuildCommand,
  packageEnvironmentExports,
  packageOwners,
  type PackageEnvironment,
} from "../release/server"
import {releaseWorkspaceState} from "./fixture/workspace-state"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const repository = fileURLToPath(new URL("../../", import.meta.url))
const packages = {
  startup: {
    path: "startup",
    name: "@hamiltonian/startup",
    scope: "hamiltonian",
    environments: ["main", "service"],
  },
  release: {
    path: "release",
    name: "@hamiltonian/release",
    scope: "hamiltonian",
    environments: ["main", "service", "server"],
  },
  visual: {
    path: "internal/visual",
    name: "@internal/visual",
    scope: "internal",
    environments: ["main", "server"],
  },
} as const

setDefaultTimeout(30_000)

test("every Hamiltonian package owns direct env entrypoints and one typecheck", async () => {
  const root = await Bun.file(join(hamiltonian, "package.json")).json() as {
    scripts?: Record<string, string>
  }
  expect(root.scripts?.dev).toBe(
    "NODE_ENV=development bun --conditions=hamiltonian:server --conditions=internal:server --port=4444 server",
  )
  expect(root.scripts?.start).toBe(
    "bun --conditions=hamiltonian:server --conditions=internal:server --port=4444 server",
  )
  expect(root.scripts?.build).toBe(
    "NODE_ENV=production bun --conditions=hamiltonian:server --conditions=internal:server build.ts",
  )

  for (const descriptor of Object.values(packages)) {
    const manifest = await Bun.file(join(hamiltonian, descriptor.path, "package.json")).json() as {
      exports?: {"."?: Record<string, unknown>}
      scripts?: Record<string, string>
    }
    const rootExport = manifest.exports?.["."]
    expect(rootExport?.default).toBeUndefined()
    expect(manifest.scripts?.typecheck).toBe("tsc --project tsconfig.json --pretty false")
    expect(manifest.scripts?.build).toBeUndefined()
    expect(manifest.scripts?.prebuild).toBeUndefined()

    for (const env of descriptor.environments) {
      expect(rootExport?.[`${descriptor.scope}:${env}`]).toBe(`./${env}/index.ts`)
      expect(manifest.scripts?.[`build:${env}`]).toContain(`bun build ./${env}/index.ts`)
      expect(manifest.scripts?.[`build:${env}`]).toContain(`--conditions=${descriptor.scope}:${env}`)
      expect(manifest.scripts?.[`typecheck:${env}`]).toBeUndefined()
      expect(manifest.scripts?.[`prebuild:${env}`]).toBeUndefined()
    }
  }
})

test("build executor resolves package contracts without a module registry", async () => {
  const source = await Bun.file(join(hamiltonian, "release/server/package/manifest.ts")).text()
  expect(source).not.toContain('join(root, "dist/index.js")')

  for (const descriptor of Object.values(packages)) {
    const owners = await packageOwners(descriptor.name)
    expect(owners.map(({env}) => env)).toEqual([...descriptor.environments])
    for (const env of descriptor.environments)
      expect(await buildablePackage(descriptor.name, env)).toBe(descriptor.name)
    expect(source).not.toContain(JSON.stringify(descriptor.name))
  }
  expect(await buildablePackage("@internal/missing")).toBeNull()
  expect(await buildablePackage("@internal/visual", "worker")).toBeNull()
  expect(source).toContain("Map<BuildablePackage, Promise<PackageLocation>>")
  expect(source).not.toContain("const packageOwners")
})

test("package exports keep server and server-worker as separate direct env entrypoints", () => {
  expect(packageEnvironmentExports({
    name: "@example/runtime",
    exports: {
      ".": {
        "example:server": "./server/index.ts",
        "example:server-worker": "./server-worker/index.ts",
      },
    },
  })).toEqual([
    {
      env: "server",
      condition: "example:server",
      entrypoint: "./server/index.ts",
      target: "bun",
    },
    {
      env: "server-worker",
      condition: "example:server-worker",
      entrypoint: "./server-worker/index.ts",
      target: "bun",
    },
  ])
  expect(() => packageEnvironmentExports({
    name: "@example/runtime",
    exports: {".": {default: "./server/index.ts"}},
  })).toThrow("Unsupported root export condition default")
  expect(() => packageEnvironmentExports({
    name: "@example/runtime",
    exports: {".": {"example:server": "./server.ts"}},
  })).toThrow("must target ./server/index.ts")
  expect(() => packageEnvironmentExports({
    name: "@example/runtime",
    exports: {".": {"example:service-worker": "./service-worker/index.ts"}},
  })).toThrow("Unsupported package environment service-worker")
})

test("one bare visual import resolves source types by selected env without a build", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-upd-003-env-"))

  try {
    const main = await typecheckPackageEnvironment(directory, "internal:main", `
      import * as visual from "@internal/visual"
      const environment: "main" = visual.environment
      void environment
      void visual.runtime
    `)
    expect(main.exitCode).toBe(0)

    const server = await typecheckPackageEnvironment(directory, "internal:server", `
      import * as visual from "@internal/visual"
      const environment: "server" = visual.environment
      void environment
      // @ts-expect-error server env does not expose Window runtime
      void visual.runtime
    `)
    expect(server.exitCode).toBe(0)

    const unsupported = await typecheckPackageEnvironment(directory, "internal:worker", `
      import * as visual from "@internal/visual"
      void visual
    `)
    expect(unsupported.exitCode).not.toBe(0)
    expect(unsupported.stderr + unsupported.stdout).toContain("Cannot find module '@internal/visual'")
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("canonical TypeScript verification keeps release runtime contracts in service env", async () => {
  const [rootPackage, rootConfig, testConfig, releaseServer, releaseService] = await Promise.all([
    Bun.file(join(repository, "package.json")).json() as Promise<{
      scripts?: Record<string, string>
    }>,
    Bun.file(join(repository, "tsconfig.json")).text(),
    Bun.file(join(hamiltonian, "tests/tsconfig.json")).text(),
    Bun.file(join(hamiltonian, "release/server/index.ts")).text(),
    Bun.file(join(hamiltonian, "release/service/index.ts")).text(),
  ])

  expect(rootPackage.scripts?.typecheck).toBe(
    "bun run --filter @hamiltonian/startup typecheck && bun run --filter @hamiltonian/release typecheck && bun run --filter @internal/visual typecheck && tsc --project hamiltonian/tests/tsconfig.json --pretty false && tsc --project tsconfig.json --pretty false",
  )
  expect(rootConfig).toContain('"hamiltonian/release/**/*"')
  expect(rootConfig).toContain('"hamiltonian/startup/**/*"')
  expect(rootConfig).toContain('"hamiltonian/internal/visual/**/*"')
  expect(rootConfig).toContain('"hamiltonian/tests/**/*"')
  expect(testConfig).toContain('"hamiltonian:service"')
  expect(testConfig).toContain('"serviceworker"')

  for (const contract of [
    "ReleaseDependencies",
    "ReleaseFactory",
    "ReleaseLoader",
    "ReleaseRuntime",
  ]) {
    expect(releaseServer).not.toContain(contract)
    expect(releaseService).toContain(contract)
  }

  const directory = await mkdtemp(join(tmpdir(), "metafor-upd-003-release-env-"))
  try {
    const service = await typecheckPackageEnvironment(
      directory,
      "hamiltonian:service",
      `
        import type {
          ReleaseDependencies,
          ReleaseFactory,
          ReleaseLoader,
          ReleaseRuntime,
        } from "@hamiltonian/release"
        export type RuntimeContracts = [
          ReleaseDependencies,
          ReleaseFactory,
          ReleaseLoader,
          ReleaseRuntime,
        ]
      `,
      ["serviceworker"],
    )
    expect(service.exitCode).toBe(0)

    const server = await typecheckPackageEnvironment(
      directory,
      "hamiltonian:server",
      `
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseDependencies} from "@hamiltonian/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseFactory} from "@hamiltonian/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseLoader} from "@hamiltonian/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseRuntime} from "@hamiltonian/release"
      `,
      ["bun"],
    )
    expect(server.exitCode).toBe(0)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("build executor derives development arguments from the production command", async () => {
  const serviceWorker = (await packageOwners("@hamiltonian/release"))
    .find(({env}) => env === "service")
  if (!serviceWorker) throw new Error("Release Service Worker owner is missing")
  expect(packageBuildCommand(serviceWorker.build, "production").join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, undefined).join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, "development")).toEqual([
    "bun",
    "build",
    "./service/index.ts",
    "--conditions=hamiltonian:service",
    "--target=browser",
    "--format=cjs",
    "--minify",
    "--sourcemap=inline",
    "--outfile=dist/service.js",
  ])
})

test.serial("parallel env builds run one package typecheck", async () => {
  const result = await runReleaseFixture("parallel-typecheck")
  expect(result.results).toEqual([
    {success: true, exitCode: 0, outputs: 1},
    {success: true, exitCode: 0, outputs: 1},
  ])
  expect(result.typechecks).toBe(1)
  expect(result.artifacts).toEqual([true, true])
  expect(existsSync(result.root)).toBeFalse()
  expect(occurrences(result.output, "package typecheck начат")).toBe(1)
  expect(occurrences(result.output, "package typecheck завершён")).toBe(1)
  expect(occurrences(result.output, "сборка artifact начата")).toBe(2)
  expect(occurrences(result.output, "сборка artifact завершена")).toBe(2)
})

test.serial("failed package typecheck prevents every env build", async () => {
  const result = await runReleaseFixture("failed-typecheck")
  expect(result.results).toEqual([
    {success: false, exitCode: 17, outputs: 0},
    {success: false, exitCode: 17, outputs: 0},
  ])
  expect(result.typechecks).toBe(0)
  expect(result.artifacts).toEqual([false, false])
  expect(existsSync(result.root)).toBeFalse()
  expect(occurrences(result.output, "package typecheck начат")).toBe(1)
  expect(occurrences(result.output, "package typecheck завершён")).toBe(1)
  expect(result.output).not.toContain("сборка artifact начата")
})

test("development keeps debug and source maps while production drops both", async () => {
  const state = await releaseWorkspaceState(hamiltonian)
  try {
    const development = await build("development")
    expect(development.releaseService).toContain("console.debug")
    expect(development.releaseService).toContain("соединение с сервером обновлений установлено")
    expect(development.releaseService).toContain("transaction начата")
    expect(development.startupMain).toContain("страница готова к работе")
    expect(development.releaseMain).toContain("[@hamiltonian/release:main]")
    expect(development.internalVisual).toContain("[@internal/visual:main]")
    for (const artifact of Object.values(development))
      expect(artifact).toContain("sourceMappingURL=data:application/json")

    const production = await build("production")
    for (const artifact of Object.values(production)) {
      expect(artifact).not.toContain("console.debug")
      expect(artifact).not.toContain("sourceMappingURL=")
      expect(artifact).not.toContain("/__tests")
      expect(artifact).not.toContain("LOAD_TEST_")
      expect(artifact).not.toContain("RELEASE_FIXTURE_")
    }
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
}, 30_000)

async function build(mode: "development" | "production") {
  const directory = await mkdtemp(join(tmpdir(), `metafor-build-profile-${mode}-`))
  const artifacts = {
    startupMain: join(directory, "startup-main.js"),
    startupService: join(directory, "startup-service.js"),
    releaseMain: join(directory, "release-main.js"),
    releaseService: join(directory, "release-service.js"),
    releaseServer: join(directory, "release-server.js"),
    internalVisual: join(directory, "visual-main.js"),
    internalVisualServer: join(directory, "visual-server.js"),
  }
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "--conditions=hamiltonian:server",
    "--conditions=internal:server",
    "-e",
    `import {buildPackage} from "@hamiltonian/release"; const artifacts = ${JSON.stringify(artifacts)}; console.log(JSON.stringify(await Promise.all([buildPackage("@hamiltonian/startup", {env:"main",artifact:artifacts.startupMain}), buildPackage("@hamiltonian/startup", {env:"service",artifact:artifacts.startupService}), buildPackage("@hamiltonian/release", {env:"main",artifact:artifacts.releaseMain}), buildPackage("@hamiltonian/release", {env:"service",artifact:artifacts.releaseService}), buildPackage("@hamiltonian/release", {env:"server",artifact:artifacts.releaseServer}), buildPackage("@internal/visual", {env:"main",artifact:artifacts.internalVisual}), buildPackage("@internal/visual", {env:"server",artifact:artifacts.internalVisualServer})])))`,
  ], {
    cwd: hamiltonian,
    env: {...process.env, NODE_ENV: mode},
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const resultLine = stdout.trim().split("\n").at(-1)
    if (!resultLine) throw new Error(`Package build result is missing: ${stderr}`)
    const result = JSON.parse(resultLine) as Array<{
      env: PackageEnvironment
      success: boolean
      exitCode: number | null
    }>
    expect(exitCode).toBe(0)
    expect(result.map(({env, success, exitCode: buildExitCode}) => ({env, success, exitCode: buildExitCode})))
      .toEqual([
        {env: "main", success: true, exitCode: 0},
        {env: "service", success: true, exitCode: 0},
        {env: "main", success: true, exitCode: 0},
        {env: "service", success: true, exitCode: 0},
        {env: "server", success: true, exitCode: 0},
        {env: "main", success: true, exitCode: 0},
        {env: "server", success: true, exitCode: 0},
      ])
    return {
      internalVisual: await Bun.file(artifacts.internalVisual).text(),
      releaseMain: await Bun.file(artifacts.releaseMain).text(),
      startupMain: await Bun.file(artifacts.startupMain).text(),
      releaseService: await Bun.file(artifacts.releaseService).text(),
    }
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
}

async function runReleaseFixture(scenario: "parallel-typecheck" | "failed-typecheck") {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "test",
    "./tests/fixture/release-workspace-process.ts",
  ], {
    cwd: hamiltonian,
    env: {...process.env, NODE_ENV: "development", RELEASE_FIXTURE_SCENARIO: scenario},
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Release fixture failed: ${stderr || stdout}`)
  const result = stdout.trim().split("\n").at(-1)
  if (!result) throw new Error(`Release fixture result is missing: ${stderr}`)
  return {
    ...(JSON.parse(result) as {
      root: string
      results: Array<{success: boolean, exitCode: number | null, outputs: number}>
      typechecks: number
      artifacts: boolean[]
    }),
    output: stdout,
  }
}

function occurrences(source: string, value: string) {
  return source.split(value).length - 1
}

async function typecheckPackageEnvironment(
  directory: string,
  condition: string,
  source: string,
  types = ["@webgpu/types", "bun"],
) {
  const suffix = condition.slice(condition.indexOf(":") + 1)
  const sourcePath = join(directory, `${suffix}.ts`)
  const configPath = join(directory, `${suffix}.json`)
  const modules = join(directory, "node_modules")
  if (!existsSync(modules)) await symlink(join(repository, "node_modules"), modules, "dir")
  await Promise.all([
    Bun.write(sourcePath, source),
    Bun.write(configPath, `${JSON.stringify({
      extends: join(repository, "tsconfig.json"),
      compilerOptions: {
        customConditions: [condition],
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        types,
      },
      files: [
        sourcePath,
        join(repository, "types/module.d.ts"),
        join(repository, "types/hot.d.ts"),
      ],
      include: [],
      exclude: [],
    }, null, 2)}\n`),
  ])
  const child = Bun.spawn([Bun.which("tsc") ?? "tsc", "--project", configPath, "--pretty", "false"], {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return {exitCode, stdout, stderr}
}
