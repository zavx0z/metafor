import {expect, setDefaultTimeout, test} from "bun:test"
import {existsSync, realpathSync} from "node:fs"
import {mkdtemp, readdir, rm, symlink} from "node:fs/promises"
import {dirname, join, relative} from "node:path"
import {tmpdir} from "node:os"
import {fileURLToPath} from "node:url"
import {parseSync} from "oxc-parser"
import {
  buildablePackage,
  packageBuildCommand,
  packageEnvironmentExports,
  packageOwners,
} from "../release/server"
import type {PackageEnvironment} from "../shared/package/environment"
import {releaseWorkspaceState} from "./fixture/workspace-state"

const cosmos = fileURLToPath(new URL("../", import.meta.url))
const repository = fileURLToPath(new URL("../../", import.meta.url))
const packages = {
  startup: {
    path: "startup",
    name: "@cosmos/startup",
    scope: "cosmos",
    environments: ["main", "service"],
  },
  release: {
    path: "release",
    name: "@cosmos/release",
    scope: "cosmos",
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

test("every Cosmos package owns direct env entrypoints and one typecheck", async () => {
  const root = await Bun.file(join(cosmos, "package.json")).json() as {
    scripts?: Record<string, string>
  }
  expect(root.scripts?.dev).toBe(
    "NODE_ENV=development bun --conditions=cosmos:server --conditions=internal:server --port=4444 server",
  )
  expect(root.scripts?.start).toBe(
    "bun --conditions=cosmos:server --conditions=internal:server --port=4444 server",
  )
  expect(root.scripts?.build).toBe(
    "NODE_ENV=production bun --conditions=cosmos:server --conditions=internal:server build.ts",
  )

  for (const descriptor of Object.values(packages)) {
    const manifest = await Bun.file(join(cosmos, descriptor.path, "package.json")).json() as {
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

test("Cosmos packages do not re-export types owned by another package", async () => {
  expect(await crossPackageTypeReexports()).toEqual([])
})

test("type re-export ownership covers every supported export form", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-type-ownership-"))
  const owner = join(directory, "owner")
  const consumer = join(directory, "consumer")

  try {
    await Promise.all([
      Bun.write(join(owner, "package.json"), '{"name":"@fixture/owner"}\n'),
      Bun.write(join(owner, "contracts.ts"), "export interface Owned {}\n"),
      Bun.write(join(consumer, "package.json"), '{"name":"@fixture/consumer"}\n'),
      Bun.write(join(consumer, "local.ts"), "export interface Local {}\n"),
      Bun.write(join(consumer, "direct.ts"), "export interface Direct {}\n"),
      Bun.write(join(consumer, "same-package.ts"), [
        'export type {Local} from "./local"',
        'export {type Local as Alias} from "./local"',
        'export * from "./local"',
        'import type {Local} from "./local"',
        "export {Local}",
      ].join("\n")),
      Bun.write(join(consumer, "export-type.ts"),
        'export type {Owned} from "../owner/contracts"\n'),
      Bun.write(join(consumer, "named-type.ts"),
        'export {type Owned} from "../owner/contracts"\n'),
      Bun.write(join(consumer, "export-star.ts"),
        'export * from "../owner/contracts"\n'),
      Bun.write(join(consumer, "import-export.ts"), [
        'import type {Owned} from "../owner/contracts"',
        "export {Owned}",
      ].join("\n")),
    ])

    const violations = await crossPackageTypeReexports([consumer])
    expect(violations.map(({file}) => file.split("/").at(-1)).sort()).toEqual([
      "export-star.ts",
      "export-type.ts",
      "import-export.ts",
      "named-type.ts",
    ])
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("build executor resolves package contracts without a module registry", async () => {
  const source = await Bun.file(join(cosmos, "release/server/package/manifest.ts")).text()
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
    Bun.file(join(cosmos, "tests/tsconfig.json")).text(),
    Bun.file(join(cosmos, "release/server/index.ts")).text(),
    Bun.file(join(cosmos, "release/service/index.ts")).text(),
  ])

  expect(rootPackage.scripts?.typecheck).toBe(
    "bun run --filter @metafor/dsl typecheck && bun run --filter @metafor/template typecheck && bun run --filter @internal/supervisor typecheck && bun run --filter @cosmos/startup typecheck && bun run --filter @cosmos/release typecheck && bun run --filter @internal/visual typecheck && tsc --project cosmos/tests/tsconfig.json --pretty false && tsc --project tsconfig.json --pretty false",
  )
  expect(rootConfig).toContain('"cosmos/release/**/*"')
  expect(rootConfig).toContain('"cosmos/startup/**/*"')
  expect(rootConfig).toContain('"cosmos/internal/visual/**/*"')
  expect(rootConfig).toContain('"cosmos/tests/**/*"')
  expect(testConfig).toContain('"cosmos:service"')
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
      "cosmos:service",
      `
        import type {
          ReleaseDependencies,
          ReleaseFactory,
          ReleaseLoader,
          ReleaseRuntime,
        } from "@cosmos/release"
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
      "cosmos:server",
      `
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseDependencies} from "@cosmos/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseFactory} from "@cosmos/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseLoader} from "@cosmos/release"
        // @ts-expect-error service-only contract is not public in env server
        import type {ReleaseRuntime} from "@cosmos/release"
      `,
      ["bun"],
    )
    expect(server.exitCode).toBe(0)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("build executor derives development arguments from the production command", async () => {
  const serviceWorker = (await packageOwners("@cosmos/release"))
    .find(({env}) => env === "service")
  if (!serviceWorker) throw new Error("Release Service Worker owner is missing")
  expect(packageBuildCommand(serviceWorker.build, "production").join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, undefined).join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, "development")).toEqual([
    "bun",
    "build",
    "./service/index.ts",
    "--conditions=cosmos:service",
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
    {success: true, exitCode: 0, outputs: 2},
    {success: true, exitCode: 0, outputs: 2},
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
  const state = await releaseWorkspaceState(cosmos)
  try {
    const development = await build("development")
    expect(development.sources.releaseService).toContain("console.debug")
    expect(development.sources.releaseService).toContain("соединение с сервером обновлений установлено")
    expect(development.sources.releaseService).toContain("transaction начата")
    expect(development.sources.startupMain).toContain("страница готова к работе")
    expect(development.sources.releaseMain).toContain("[@cosmos/release:main]")
    expect(development.sources.internalVisual).toContain("[@internal/visual:main]")
    for (const artifact of Object.values(development.sources))
      expect(artifact).not.toContain("sourceMappingURL=data:application/json")
    expect(development.sourceMaps.every(Boolean)).toBeTrue()

    const production = await build("production")
    for (const artifact of Object.values(production.sources)) {
      expect(artifact).not.toContain("console.debug")
      expect(artifact).not.toContain("sourceMappingURL=")
      expect(artifact).not.toContain("/__tests")
      expect(artifact).not.toContain("LOAD_TEST_")
      expect(artifact).not.toContain("RELEASE_FIXTURE_")
    }
    expect(production.sourceMaps.some(Boolean)).toBeFalse()
  } finally {
    expect(await releaseWorkspaceState(cosmos)).toEqual(state)
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
    "--conditions=cosmos:server",
    "--conditions=internal:server",
    "-e",
    `import {buildPackage} from "@cosmos/release"; const artifacts = ${JSON.stringify(artifacts)}; console.log(JSON.stringify(await Promise.all([buildPackage("@cosmos/startup", {env:"main",artifact:artifacts.startupMain}), buildPackage("@cosmos/startup", {env:"service",artifact:artifacts.startupService}), buildPackage("@cosmos/release", {env:"main",artifact:artifacts.releaseMain}), buildPackage("@cosmos/release", {env:"service",artifact:artifacts.releaseService}), buildPackage("@cosmos/release", {env:"server",artifact:artifacts.releaseServer}), buildPackage("@internal/visual", {env:"main",artifact:artifacts.internalVisual}), buildPackage("@internal/visual", {env:"server",artifact:artifacts.internalVisualServer})])))`,
  ], {
    cwd: cosmos,
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
      sources: {
        internalVisual: await Bun.file(artifacts.internalVisual).text(),
        releaseMain: await Bun.file(artifacts.releaseMain).text(),
        startupMain: await Bun.file(artifacts.startupMain).text(),
        releaseService: await Bun.file(artifacts.releaseService).text(),
      },
      sourceMaps: await Promise.all(
        Object.values(artifacts).map((artifact) => Bun.file(`${artifact}.map`).exists()),
      ),
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
    cwd: cosmos,
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
        join(repository, "scripts/types/module.d.ts"),
        join(repository, "scripts/types/hot.d.ts"),
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

async function crossPackageTypeReexports(
  roots = ["startup", "release", "internal"].map((path) => join(cosmos, path)),
) {
  const files = (await Promise.all(roots.map(sourceFiles))).flat()
  const violations = (await Promise.all(files.map(readTypeReexports))).flat()
  return violations.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line)
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {withFileTypes: true})
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path)
  }
  return files
}

async function readTypeReexports(path: string) {
  const source = await Bun.file(path).text()
  const module = parseSync(path, source).module
  const owner = await nearestPackage(path)
  const violations: Array<{
    file: string
    line: number
    sourceOwner: string
    targetOwner: string
  }> = []
  for (const exported of module.staticExports) {
    const specifiers = new Set(exported.entries.flatMap((entry) =>
      entry.moduleRequest !== null &&
      (entry.isType || entry.importName.kind === "AllButDefault")
        ? [entry.moduleRequest.value]
        : []
    ))
    for (const specifier of specifiers) {
      const target = resolveModule(specifier, path)
      if (!target) throw new Error(`Cannot resolve ${specifier} from ${relative(cosmos, path)}`)
      const targetOwner = await nearestPackage(target)
      if (owner.path === targetOwner.path) continue
      violations.push({
        file: relative(cosmos, path),
        line: source.slice(0, exported.start).split(/\r?\n/).length,
        sourceOwner: owner.name,
        targetOwner: targetOwner.name,
      })
    }
  }
  return violations
}

function resolveModule(specifier: string, containingFile: string) {
  try {
    return Bun.resolveSync(specifier, dirname(containingFile))
  } catch {
    return undefined
  }
}

async function nearestPackage(path: string) {
  let directory = dirname(path)
  while (true) {
    const manifest = join(directory, "package.json")
    if (existsSync(manifest)) {
      const value = await Bun.file(manifest).json() as {name?: unknown}
      if (typeof value.name !== "string") throw new Error(`Package name is missing in ${manifest}`)
      return {name: value.name, path: realpathSync(manifest)}
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`Package owner is missing for ${path}`)
}
