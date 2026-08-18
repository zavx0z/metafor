import {expect, setDefaultTimeout, test} from "bun:test"
import {existsSync} from "node:fs"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  publishImmutableArtifact,
  restoreManifest,
  writeRootVersions,
} from "../release/server"
import {releaseWorkspaceState} from "./fixture/workspace-state"

setDefaultTimeout(30_000)
const hamiltonian = fileURLToPath(new URL("../", import.meta.url))

test("root intent write precedes build and child writes in the host transaction", async () => {
  const source = await Bun.file(new URL("../release/server/release/publication.ts", import.meta.url)).text()
  const server = await Bun.file(new URL("../server.ts", import.meta.url)).text()
  const rootWrite = source.indexOf("await writeRootVersions(")
  const build = source.indexOf("const results = await buildPlans(plans)", rootWrite)
  const children = source.indexOf("await writeChildVersions(plans)", build)
  expect(rootWrite).toBeGreaterThan(0)
  expect(build).toBeGreaterThan(rootWrite)
  expect(children).toBeGreaterThan(build)
  expect(server.indexOf("await recoverPublication()"))
    .toBeLessThan(server.indexOf("Bun.serve<RpcSocketData>"))
})

test("root intent is one reversible atomic manifest write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-root-intent-"))
  const manifest = join(directory, "package.json")
  const source = `${JSON.stringify({
    name: "fixture",
    dependencies: {
      "@hamiltonian/release": "workspace:^1.0.0",
      unrelated: "workspace:*",
    },
  }, null, 2)}\n`

  try {
    await Bun.write(manifest, source)
    await writeRootVersions(manifest, new Map([["@hamiltonian/release", "1.1.0"]]))
    expect(await Bun.file(manifest).json()).toEqual({
      name: "fixture",
      dependencies: {
        "@hamiltonian/release": "workspace:^1.1.0",
        unrelated: "workspace:*",
      },
    })
    await restoreManifest(manifest, source)
    expect(await Bun.file(manifest).text()).toBe(source)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("immutable publication reuses equal bytes and rejects a conflict", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-immutable-artifact-"))
  const staged = join(directory, "staged.js")
  const target = join(directory, "versions", "1.0.0", "index.js")

  try {
    await Bun.write(staged, "export const value = 1\n")
    const published = await publishImmutableArtifact(staged, target)
    expect(published.size).toBeGreaterThan(0)
    expect((await publishImmutableArtifact(staged, target)).sha256).toBe(published.sha256)

    await Bun.write(staged, "export const value = 2\n")
    await expect(publishImmutableArtifact(staged, target)).rejects.toThrow(
      "Immutable artifact conflict",
    )
    expect(await Bun.file(target).text()).toBe("export const value = 1\n")
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test("cold recovery reproduces and reuses every converged exact artifact", async () => {
  const state = await releaseWorkspaceState(hamiltonian)
  try {
    const fixture = await runReleaseFixture("cold-recovery")
    const {stdout} = fixture
    const result = fixture.result as unknown as {
      root: string
      recovered: string[]
      artifacts: Array<{path: string, sha256: string, size: number}>
    }
    expect(result.recovered).toEqual([])
    expect(existsSync(result.root)).toBeFalse()
    expect(result.artifacts).toHaveLength(5)
    for (const artifact of result.artifacts) {
      expect(artifact.path).toStartWith("/")
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(artifact.size).toBeGreaterThan(0)
    }
    const started = stdout.indexOf("восстановление публикации начато")
    const completed = stdout.indexOf("восстановление публикации завершено")
    expect(started).toBeGreaterThan(-1)
    expect(completed).toBeGreaterThan(started)
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
})

test("converged publication state does not emit recovery diagnostics", async () => {
  const state = await releaseWorkspaceState(hamiltonian)
  try {
    const {stdout} = await runReleaseFixture("converged-recovery")
    expect(stdout).not.toContain("восстановление публикации начато")
    expect(stdout).not.toContain("восстановление публикации завершено")
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
})

test("production publication diagnostics preserve success and rollback order", async () => {
  const state = await releaseWorkspaceState(hamiltonian)
  try {
    const success = await runReleaseFixture("publication")
    expect((success.result as {status: number}).status).toBe(200)
    expect((success.result as {notifications: string[]}).notifications).toEqual([
      JSON.stringify({type: "release-changed"}),
    ])
    expectOrdered(success.stdout, [
      "публикация release запрошена",
      "root intent публикации сохранён",
      "package typecheck начат",
      "package typecheck завершён",
      "сборка artifact начата",
      "сборка artifact завершена",
      "публикация release завершена",
      "сигнал об обновлении отправлен",
    ])

    const failure = await runReleaseFixture("failed-publication")
    expect((failure.result as {status: number}).status).toBe(422)
    expect((failure.result as {notifications: string[]}).notifications).toEqual([])
    expectOrdered(failure.output, [
      "публикация release запрошена",
      "root intent публикации сохранён",
      "package typecheck начат",
      "package typecheck завершён",
      "публикация отменена с восстановлением root",
      "публикация release завершилась с ошибкой",
    ])
    expect(failure.output).not.toContain("сигнал об обновлении отправлен")
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
})

test("production delivery diagnostics distinguish delivered and missing artifacts", async () => {
  const state = await releaseWorkspaceState(hamiltonian)
  try {
    const {stdout, result} = await runReleaseFixture("delivery")
    expect(result).toEqual(expect.objectContaining({delivered: 200, missing: 404}))
    expectOrdered(stdout, ["browser artifact доставлен", "browser artifact не найден"])
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
})

async function runReleaseFixture(scenario: string) {
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
  if (exitCode !== 0) throw new Error(`${scenario} fixture failed: ${stderr || stdout}`)
  const line = stdout.trim().split("\n").at(-1)
  if (!line) throw new Error(`${scenario} fixture result is missing: ${stderr}`)
  return {stdout, output: `${stdout}\n${stderr}`, result: JSON.parse(line) as Record<string, unknown>}
}

function expectOrdered(source: string, events: string[]) {
  let cursor = -1
  for (const event of events) {
    const next = source.indexOf(event, cursor + 1)
    expect(next).toBeGreaterThan(cursor)
    cursor = next
  }
}
