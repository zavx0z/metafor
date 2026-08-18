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
    const child = Bun.spawn([
      Bun.which("bun") ?? "bun",
      "test",
      "./tests/fixture/release-workspace-process.ts",
    ], {
      cwd: hamiltonian,
      env: {...process.env, RELEASE_FIXTURE_SCENARIO: "cold-recovery"},
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (exitCode !== 0) throw new Error(`Cold recovery fixture failed: ${stderr || stdout}`)
    const line = stdout.trim().split("\n").at(-1)
    if (!line) throw new Error(`Cold recovery fixture result is missing: ${stderr}`)
    const result = JSON.parse(line) as {
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
  } finally {
    expect(await releaseWorkspaceState(hamiltonian)).toEqual(state)
  }
})
