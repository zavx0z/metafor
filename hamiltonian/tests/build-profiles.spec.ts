import {expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  buildablePackage,
  packageBuildCommand,
  packageEnvironmentExports,
  type PackageEnvironment,
} from "../web/release/server"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const packageBuildScripts = {
  "web/startup/main": {env: "main", build:
    "bun build ./index.ts --conditions=metafor:main --target=browser --packages=external --production --minify --drop console.debug --outfile=dist/index.js"},
  "web/startup/service": {env: "service-worker", build:
    "bun build ./index.ts --conditions=metafor:service-worker --target=browser --production --minify --drop console.debug --outfile=dist/index.js"},
  "web/release/main": {env: "main", build:
    "bun build ./main.ts --conditions=metafor:main --target=browser --packages=external --production --minify --drop console.debug --outfile=dist/index.js"},
  "web/release/service": {env: "service-worker", build:
    "bun build ./index.ts --conditions=metafor:service-worker --target=browser --format=cjs --production --minify --drop console.debug --outfile=dist/index.js"},
  "web/release/server": {env: "server", build:
    "bun build ./index.ts --conditions=metafor:server --target=bun --packages=external --production --minify --drop console.debug --outfile=dist/index.js"},
  "internal/visual": {env: "main", build:
    "bun build ./index.ts --conditions=metafor:main --target=browser --production --minify --drop console.debug --outfile=dist/index.js"},
} as const

test("every package environment owns one direct production build command", async () => {
  const root = await Bun.file(join(hamiltonian, "package.json")).json() as {
    scripts?: Record<string, string>
  }
  expect(root.scripts?.dev).toBe(
    "NODE_ENV=development bun --conditions=metafor:server --port=4444 server",
  )
  expect(root.scripts?.start).toBe("bun --conditions=metafor:server --port=4444 server")
  expect(root.scripts?.build).toBe(
    "bun run --parallel --if-present --filter '@startup/*' --filter '@release/*' --filter '@internal/*' build",
  )

  for (const [path, {env, build}] of Object.entries(packageBuildScripts)) {
    const [manifest, tsconfig] = await Promise.all([
      Bun.file(join(hamiltonian, path, "package.json")).json() as Promise<{
        exports?: {"."?: Record<string, unknown>}
        scripts?: Record<string, string>
      }>,
      Bun.file(join(hamiltonian, path, "tsconfig.json")).json() as Promise<{
        compilerOptions?: {customConditions?: string[]}
      }>,
    ])
    const typedManifest = manifest as {
      exports?: {"."?: Record<string, unknown>}
      scripts?: Record<string, string>
    }

    expect(typedManifest.exports?.["."]?.default).toBeUndefined()
    expect(typedManifest.exports?.["."]?.[`metafor:${env}`]).toBeDefined()
    expect(tsconfig.compilerOptions?.customConditions).toEqual([`metafor:${env}`])
    expect(typedManifest.scripts?.build).toBe(build)
    expect(typedManifest.scripts?.[`build:${env}`]).toBe(build)
    expect(typedManifest.scripts?.[`prebuild:${env}`]).toBe(`bun run typecheck:${env}`)
    expect(typedManifest.scripts?.["build:development"]).toBeUndefined()
    expect(typedManifest.scripts?.["build:production"]).toBeUndefined()
  }
})

test("build executor resolves package contracts without a module registry", async () => {
  const source = await Bun.file(join(hamiltonian, "web/release/server/package.ts")).text()
  expect(source).not.toContain('join(root, "dist/index.js")')

  for (const [path, {env}] of Object.entries(packageBuildScripts)) {
    const manifest = await Bun.file(join(hamiltonian, path, "package.json")).json() as {
      name?: string
    }
    if (typeof manifest.name !== "string") throw new Error(`${path} package name is missing`)
    expect(await buildablePackage(manifest.name, env)).toBe(manifest.name)
    expect(source).not.toContain(JSON.stringify(manifest.name))
  }
  expect(await buildablePackage("@internal/missing")).toBeNull()
  expect(await buildablePackage("@internal/visual", "worker")).toBeNull()
  expect(source).toContain("Map<BuildablePackage, Promise<PackageLocation>>")
  expect(source).not.toContain("const packageOwners")
})

test("package exports keep server and server-worker as separate build units", () => {
  expect(packageEnvironmentExports({
    exports: {
      ".": {
        "metafor:server": {types: "./server.ts", bun: "./server.ts"},
        "metafor:server-worker": {types: "./server-worker.ts", bun: "./server-worker.ts"},
      },
    },
  })).toEqual([
    {
      env: "server",
      condition: "metafor:server",
      entrypoint: "./server.ts",
      types: "./server.ts",
      target: "bun",
    },
    {
      env: "server-worker",
      condition: "metafor:server-worker",
      entrypoint: "./server-worker.ts",
      types: "./server-worker.ts",
      target: "bun",
    },
  ])
  expect(() => packageEnvironmentExports({
    exports: {".": {default: "./server.ts"}},
  })).toThrow("Unsupported root export condition default")
})

test("build executor derives development arguments from the production command", () => {
  const production = packageBuildScripts["web/release/service"].build
  expect(packageBuildCommand(production, "production").join(" ")).toBe(production)
  expect(packageBuildCommand(production, undefined).join(" ")).toBe(production)
  expect(packageBuildCommand(production, "development")).toEqual([
    "bun",
    "build",
    "./index.ts",
    "--conditions=metafor:service-worker",
    "--target=browser",
    "--format=cjs",
    "--minify",
    "--sourcemap=inline",
    "--outfile=dist/index.js",
  ])
  expect(packageBuildCommand(
    "bun build ./index.ts --sourcemap=none --outfile custom/browser.js --production --drop=console.debug",
    "development",
  )).toEqual([
    "bun",
    "build",
    "./index.ts",
    "--sourcemap=inline",
    "--outfile",
    "custom/browser.js",
  ])
})

test("development keeps debug and source map while production drops both", async () => {
  const development = await build("development")
  expect(development.releaseService).toContain("console.debug")
  expect(development.releaseService).toContain("подключились к серверу обновлений")
  expect(development.releaseService).toContain("получен сигнал об обновлении")
  expect(development.releaseService).toContain("перезагрузка страниц началась")
  expect(development.releaseService).toContain("transaction intent сохранён")
  expect(development.releaseService).toContain("transaction завершена удалением cache")
  expect(development.releaseService).toContain("начинаем повторную навигацию страниц")
  expect(development.startupMain).toContain("страница готова к работе")
  expect(development.releaseMain).toContain("[@release/main]")
  expect(development.releaseMain).toContain("Visual runtime подключён")
  expect(development.internalVisual).toContain("[@internal/visual]")
  expect(development.internalVisual).toContain("основное visual-окружение создано")
  for (const artifact of Object.values(development)) {
    expect(artifact).toContain("sourceMappingURL=data:application/json")
  }

  const production = await build("production")
  expect(production.releaseService).not.toContain("подключились к серверу обновлений")
  expect(production.releaseService).not.toContain("получено уведомление об обновлении")
  expect(production.releaseService).not.toContain("перезагрузка страниц началась")
  expect(production.releaseService).not.toContain("transaction intent сохранён")
  expect(production.releaseService).not.toContain("transaction завершена удалением cache")
  expect(production.releaseService).not.toContain("начинаем повторную навигацию страниц")
  expect(production.releaseService).not.toContain("подготовка кэша завершилась с ошибкой")
  expect(production.startupMain).not.toContain("страница готова к работе")
  for (const artifact of Object.values(production)) {
    expect(artifact).not.toContain("console.debug")
    expect(artifact).not.toContain("sourceMappingURL=")
    expect(artifact).not.toMatch(/\[@(?:startup|release|internal)\//)
  }
}, 30_000)

async function build(mode: "development" | "production") {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "--conditions=metafor:server",
    "-e",
    'import {buildPackage} from "@release/server"; console.log(JSON.stringify(await Promise.all([buildPackage("@startup/main", {env:"main"}), buildPackage("@startup/service", {env:"service-worker"}), buildPackage("@release/main", {env:"main"}), buildPackage("@release/service", {env:"service-worker"}), buildPackage("@internal/visual", {env:"main"})])))',
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
  if (!resultLine) throw new Error("Package build result is missing")
  const result = JSON.parse(resultLine) as Array<{
    env: PackageEnvironment
    success: boolean
    exitCode: number | null
  }>
  expect({processExitCode: exitCode, stderr, result}).toMatchObject({
    processExitCode: 0,
    result: [
      {env: "main", success: true, exitCode: 0},
      {env: "service-worker", success: true, exitCode: 0},
      {env: "main", success: true, exitCode: 0},
      {env: "service-worker", success: true, exitCode: 0},
      {env: "main", success: true, exitCode: 0},
    ],
  })
  return {
    internalVisual: await Bun.file(join(hamiltonian, "internal/visual/dist/index.js")).text(),
    releaseMain: await Bun.file(join(hamiltonian, "web/release/main/dist/index.js")).text(),
    startupMain: await Bun.file(join(hamiltonian, "web/startup/main/dist/index.js")).text(),
    startupService: await Bun.file(join(hamiltonian, "web/startup/service/dist/index.js")).text(),
    releaseService: await Bun.file(join(hamiltonian, "web/release/service/dist/index.js")).text(),
  }
}
