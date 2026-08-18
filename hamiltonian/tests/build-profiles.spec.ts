import {afterEach, expect, setDefaultTimeout, test} from "bun:test"
import {mkdir, mkdtemp, rm} from "node:fs/promises"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  buildablePackage,
  buildPackage,
  packageBuildCommand,
  packageEnvironmentExports,
  packageOwners,
  type PackageEnvironment,
} from "../release/server"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const repository = fileURLToPath(new URL("../../", import.meta.url))
const proof = join(hamiltonian, "internal/visual/.typecheck-proof")
const proofArtifacts = [
  join(hamiltonian, "internal/visual/.typecheck-main.js"),
  join(hamiltonian, "internal/visual/.typecheck-server.js"),
] as const
const packages = {
  startup: {
    path: "startup",
    name: "@hamiltonian/startup",
    scope: "hamiltonian",
    environments: ["main", "service-worker"],
  },
  release: {
    path: "release",
    name: "@hamiltonian/release",
    scope: "hamiltonian",
    environments: ["main", "service-worker", "server"],
  },
  visual: {
    path: "internal/visual",
    name: "@internal/visual",
    scope: "internal",
    environments: ["main", "server"],
  },
} as const

setDefaultTimeout(30_000)

afterEach(async () => {
  await Promise.all([proof, ...proofArtifacts].map((path) => rm(path, {force: true})))
})

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
})

test("one bare visual import resolves source types by selected env without a build", async () => {
  const temporaryRoot = join(repository, "tests/tmp")
  await mkdir(temporaryRoot, {recursive: true})
  const directory = await mkdtemp(join(temporaryRoot, "upd-003-env-"))

  try {
    const main = await typecheckVisualEnvironment(directory, "internal:main", `
      import * as visual from "@internal/visual"
      const environment: "main" = visual.environment
      void environment
      void visual.runtime
    `)
    expect(main.exitCode).toBe(0)

    const server = await typecheckVisualEnvironment(directory, "internal:server", `
      import * as visual from "@internal/visual"
      const environment: "server" = visual.environment
      void environment
      // @ts-expect-error server env does not expose Window runtime
      void visual.runtime
    `)
    expect(server.exitCode).toBe(0)

    const unsupported = await typecheckVisualEnvironment(directory, "internal:worker", `
      import * as visual from "@internal/visual"
      void visual
    `)
    expect(unsupported.exitCode).not.toBe(0)
    expect(unsupported.stderr + unsupported.stdout).toContain("Cannot find module '@internal/visual'")
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("build executor derives development arguments from the production command", async () => {
  const serviceWorker = (await packageOwners("@hamiltonian/release"))
    .find(({env}) => env === "service-worker")
  if (!serviceWorker) throw new Error("Release Service Worker owner is missing")
  expect(packageBuildCommand(serviceWorker.build, "production").join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, undefined).join(" ")).toBe(serviceWorker.build)
  expect(packageBuildCommand(serviceWorker.build, "development")).toEqual([
    "bun",
    "build",
    "./service-worker/index.ts",
    "--conditions=hamiltonian:service-worker",
    "--target=browser",
    "--format=cjs",
    "--minify",
    "--sourcemap=inline",
    "--outfile=dist/service-worker.js",
  ])
})

test.serial("parallel env builds run one package typecheck", async () => {
  const manifestPath = join(hamiltonian, "internal/visual/package.json")
  const source = await Bun.file(manifestPath).text()
  const manifest = JSON.parse(source) as {scripts: Record<string, string>}
  manifest.scripts.typecheck =
    `bun -e 'import {appendFileSync} from "node:fs"; appendFileSync(${JSON.stringify(proof)}, "checked\\n")'`
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  try {
    const results = await Promise.all([
      buildPackage("@internal/visual", {env: "main", artifact: proofArtifacts[0]}),
      buildPackage("@internal/visual", {env: "server", artifact: proofArtifacts[1]}),
    ])
    expect(results.every(({success}) => success)).toBeTrue()
    expect((await Bun.file(proof).text()).trim().split("\n")).toHaveLength(1)
  } finally {
    await Bun.write(manifestPath, source)
  }
})

test.serial("failed package typecheck prevents every env build", async () => {
  const manifestPath = join(hamiltonian, "internal/visual/package.json")
  const source = await Bun.file(manifestPath).text()
  const manifest = JSON.parse(source) as {scripts: Record<string, string>}
  manifest.scripts.typecheck = "bun -e 'process.exit(17)'"
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  try {
    const results = await Promise.all([
      buildPackage("@internal/visual", {env: "main", artifact: proofArtifacts[0]}),
      buildPackage("@internal/visual", {env: "server", artifact: proofArtifacts[1]}),
    ])
    expect(results.map(({exitCode}) => exitCode)).toEqual([17, 17])
    expect(results.every(({outputs}) => outputs.length === 0)).toBeTrue()
    expect(await Promise.all(proofArtifacts.map((path) => Bun.file(path).exists()))).toEqual([false, false])
  } finally {
    await Bun.write(manifestPath, source)
  }
})

test("development keeps debug and source maps while production drops both", async () => {
  const development = await build("development")
  expect(development.releaseService).toContain("console.debug")
  expect(development.releaseService).toContain("подключились к серверу обновлений")
  expect(development.releaseService).toContain("transaction marker сохранён")
  expect(development.startupMain).toContain("страница готова к работе")
  expect(development.releaseMain).toContain("[@hamiltonian/release:main]")
  expect(development.internalVisual).toContain("[@internal/visual:main]")
  for (const artifact of Object.values(development))
    expect(artifact).toContain("sourceMappingURL=data:application/json")

  const production = await build("production")
  for (const artifact of Object.values(production)) {
    expect(artifact).not.toContain("console.debug")
    expect(artifact).not.toContain("sourceMappingURL=")
  }
}, 30_000)

async function build(mode: "development" | "production") {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "--conditions=hamiltonian:server",
    "--conditions=internal:server",
    "-e",
    'import {buildPackage} from "@hamiltonian/release"; console.log(JSON.stringify(await Promise.all([buildPackage("@hamiltonian/startup", {env:"main"}), buildPackage("@hamiltonian/startup", {env:"service-worker"}), buildPackage("@hamiltonian/release", {env:"main"}), buildPackage("@hamiltonian/release", {env:"service-worker"}), buildPackage("@hamiltonian/release", {env:"server"}), buildPackage("@internal/visual", {env:"main"}), buildPackage("@internal/visual", {env:"server"})])))',
  ], {
    cwd: hamiltonian,
    env: {...process.env, NODE_ENV: mode},
    stdout: "pipe",
    stderr: "pipe",
  })
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
      {env: "service-worker", success: true, exitCode: 0},
      {env: "main", success: true, exitCode: 0},
      {env: "service-worker", success: true, exitCode: 0},
      {env: "server", success: true, exitCode: 0},
      {env: "main", success: true, exitCode: 0},
      {env: "server", success: true, exitCode: 0},
    ])
  return {
    internalVisual: await Bun.file(join(hamiltonian, "internal/visual/dist/main.js")).text(),
    releaseMain: await Bun.file(join(hamiltonian, "release/dist/main.js")).text(),
    startupMain: await Bun.file(join(hamiltonian, "startup/dist/main.js")).text(),
    releaseService: await Bun.file(join(hamiltonian, "release/dist/service-worker.js")).text(),
  }
}

async function typecheckVisualEnvironment(
  directory: string,
  condition: string,
  source: string,
) {
  const suffix = condition.slice(condition.indexOf(":") + 1)
  const sourcePath = join(directory, `${suffix}.ts`)
  const configPath = join(directory, `${suffix}.json`)
  await Promise.all([
    Bun.write(sourcePath, source),
    Bun.write(configPath, `${JSON.stringify({
      extends: join(repository, "tsconfig.json"),
      compilerOptions: {
        customConditions: [condition],
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        types: ["@webgpu/types", "bun"],
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
