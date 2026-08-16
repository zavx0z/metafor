import {expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {buildableModule, packageBuildCommand} from "../build.ts"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const packageBuildScripts = {
  "web/startup/main":
    "bun build ./index.ts --target=browser --external=/code?module=@import/main --production --minify --drop console.debug --outfile=dist/index.js",
  "web/startup/service":
    "bun build ./index.ts --target=browser --production --minify --drop console.debug --outfile=dist/index.js",
  "web/import/main":
    "bun build ./main.ts --target=browser --production --minify --drop console.debug --outfile=dist/index.js",
  "web/import/service":
    "bun build ./index.ts --target=browser --format=cjs --production --minify --drop console.debug --outfile=dist/index.js",
  "internal/rpc":
    "bun build ./service/web/index.ts --target=browser --format=iife --production --minify --drop console.debug --outfile=dist/index.js",
} as const

test("every browser artifact owns one direct production build command", async () => {
  const root = await Bun.file(join(hamiltonian, "package.json")).json() as {
    scripts?: Record<string, string>
  }
  expect(root.scripts?.dev).toBe("NODE_ENV=development bun --port=4444 server")
  expect(root.scripts?.start).toBe("bun --port=4444 server")
  expect(root.scripts?.build).toBe(
    "bun run --parallel --if-present --filter '@startup/*' --filter '@import/*' --filter '@internal/*' build",
  )

  for (const [path, build] of Object.entries(packageBuildScripts)) {
    const manifest = await Bun.file(join(hamiltonian, path, "package.json")).json() as {
      scripts?: Record<string, string>
    }

    expect(manifest.scripts?.build).toBe(build)
    expect(manifest.scripts?.["build:development"]).toBeUndefined()
    expect(manifest.scripts?.["build:production"]).toBeUndefined()
  }
})

test("build executor resolves package contracts without a module registry", async () => {
  const source = await Bun.file(join(hamiltonian, "build.ts")).text()
  expect(source).not.toContain('join(root, "dist/index.js")')

  for (const [path] of Object.entries(packageBuildScripts)) {
    const manifest = await Bun.file(join(hamiltonian, path, "package.json")).json() as {
      name?: string
    }
    if (typeof manifest.name !== "string") throw new Error(`${path} package name is missing`)
    expect(await buildableModule(manifest.name)).toBe(manifest.name)
    expect(source).not.toContain(JSON.stringify(manifest.name))
  }
  expect(await buildableModule("@internal/missing")).toBeNull()
})

test("build executor derives development arguments from the production command", () => {
  const production = packageBuildScripts["internal/rpc"]
  expect(packageBuildCommand(production, "production").join(" ")).toBe(production)
  expect(packageBuildCommand(production, undefined).join(" ")).toBe(production)
  expect(packageBuildCommand(production, "development")).toEqual([
    "bun",
    "build",
    "./service/web/index.ts",
    "--target=browser",
    "--format=iife",
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
  expect(development.rpc).toContain("console.debug")
  expect(development.rpc).toContain("подключились к серверу обновлений")
  expect(development.rpc).toContain("получено уведомление об обновлении")
  expect(development.rpc).toContain("перезагрузка страниц началась")
  expect(development.importService).toContain("загрузка новой сборки началась")
  expect(development.importService).toContain("запись кэша заменена")
  expect(development.importService).toContain("начинаем повторную навигацию страниц")
  expect(development.startupMain).toContain("страница готова к работе")
  for (const artifact of Object.values(development)) {
    expect(artifact).toContain("sourceMappingURL=data:application/json")
  }

  const production = await build("production")
  expect(production.rpc).not.toContain("подключились к серверу обновлений")
  expect(production.rpc).not.toContain("получено уведомление об обновлении")
  expect(production.rpc).not.toContain("перезагрузка страниц началась")
  expect(production.importService).not.toContain("загрузка новой сборки началась")
  expect(production.importService).not.toContain("запись кэша заменена")
  expect(production.importService).not.toContain("начинаем повторную навигацию страниц")
  expect(production.importService).not.toContain("замена кэша завершилась с ошибкой")
  expect(production.startupMain).not.toContain("страница готова к работе")
  for (const artifact of Object.values(production)) {
    expect(artifact).not.toContain("console.debug")
    expect(artifact).not.toContain("sourceMappingURL=")
    expect(artifact).not.toMatch(/\[@(?:startup|import|internal)\//)
  }
})

async function build(mode: "development" | "production") {
  const child = Bun.spawn([
    Bun.which("bun") ?? "bun",
    "-e",
    'import {buildPackage} from "./build.ts"; console.log(JSON.stringify(await Promise.all([buildPackage("@startup/main"), buildPackage("@import/service"), buildPackage("@internal/rpc")])))',
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
  const result = JSON.parse(resultLine) as Array<{success: boolean; exitCode: number | null}>
  expect({processExitCode: exitCode, stderr, result}).toMatchObject({
    processExitCode: 0,
    result: [
      {success: true, exitCode: 0},
      {success: true, exitCode: 0},
      {success: true, exitCode: 0},
    ],
  })
  return {
    startupMain: await Bun.file(join(hamiltonian, "web/startup/main/dist/index.js")).text(),
    importService: await Bun.file(join(hamiltonian, "web/import/service/dist/index.js")).text(),
    rpc: await Bun.file(join(hamiltonian, "internal/rpc/dist/index.js")).text(),
  }
}
