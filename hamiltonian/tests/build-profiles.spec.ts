import {expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

const hamiltonian = fileURLToPath(new URL("../", import.meta.url))
const buildSelection =
  "if [ \"$NODE_ENV\" = development ]; then bun run build:development; else bun run build:production; fi"
const packages = [
  "web/startup/main",
  "web/startup/service",
  "web/import/main",
  "web/import/service",
  "internal/rpc",
] as const

test("every browser artifact selects one exact build profile", async () => {
  const root = await Bun.file(join(hamiltonian, "package.json")).json() as {
    scripts?: Record<string, string>
  }
  expect(root.scripts?.dev).toBe("NODE_ENV=development bun --port=4444 server")
  expect(root.scripts?.start).toBe("NODE_ENV=production bun --port=4444 server")
  expect(root.scripts?.build).toStartWith("NODE_ENV=production ")

  for (const path of packages) {
    const manifest = await Bun.file(join(hamiltonian, path, "package.json")).json() as {
      scripts?: Record<string, string>
    }
    const development = manifest.scripts?.["build:development"] ?? ""
    const production = manifest.scripts?.["build:production"] ?? ""

    expect(manifest.scripts?.build).toBe(buildSelection)
    expect(development).toContain("bun build ./")
    expect(development).toContain("--minify")
    expect(development).toContain("--sourcemap=inline")
    expect(development).toContain("--outfile=dist/index.js")
    expect(development).not.toContain("--production")
    expect(development).not.toContain("--drop")
    expect(production).toContain("bun build ./")
    expect(production).toContain("--production")
    expect(production).toContain("--minify")
    expect(production).toContain("--drop console.debug")
    expect(production).toContain("--outfile=dist/index.js")
    expect(production).not.toContain("--sourcemap")
  }
})

test("development keeps debug and source map while production drops both", async () => {
  const packageRoot = join(hamiltonian, "internal/rpc")
  const development = await build(packageRoot, "development")
  expect(development).toContain("console.debug")
  expect(development).toContain("rpc/service websocket connected")
  expect(development).toContain("sourceMappingURL=data:application/json")

  const production = await build(packageRoot, "production")
  expect(production).not.toContain("console.debug")
  expect(production).not.toContain("rpc/service websocket connected")
  expect(production).not.toContain("rpc/service websocket disconnected")
  expect(production).not.toContain("sourceMappingURL=")
  expect(production).toContain("console.error")
  expect(production).toContain("rpc/service websocket error")
})

async function build(packageRoot: string, mode: "development" | "production") {
  const child = Bun.spawn([Bun.which("bun") ?? "bun", "run", "--silent", "build"], {
    cwd: packageRoot,
    env: {...process.env, NODE_ENV: mode},
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect({exitCode, stdout, stderr}).toMatchObject({exitCode: 0})
  return await Bun.file(join(packageRoot, "dist/index.js")).text()
}
