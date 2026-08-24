import {afterEach, expect, test} from "bun:test"
import {mkdtemp, mkdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {artifactIntegrity} from "../shared/package/integrity"
import {currentServerReleaseArtifact} from "../startup/server/artifact"
import {observeServerRelease, startServerRelease} from "../startup/server"
import {captureDiagnostics} from "./fixture/diagnostics"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, {recursive: true, force: true})))
})

test("server startup resolves the last completed exact release artifact", async () => {
  const {artifactPath, root, source} = await releaseLayout("ready")
  const artifact = await currentServerReleaseArtifact(root)
  const integrity = await artifactIntegrity(new TextEncoder().encode(source).buffer)

  expect(artifact).toEqual({
    identity: {
      name: "@cosmos/release",
      env: "server",
      version: "1.2.3",
      sha256: integrity.sha256,
      size: integrity.size,
    },
    executable: artifactPath,
  })
})

test.serial("server startup activates one exact release process and destroys it explicitly", async () => {
  const {root} = await releaseLayout("ready")
  const {result: host, diagnostics} = await captureDiagnostics(() => startServerRelease({
    cosmosRoot: root,
    port: 47_001,
    readyTimeoutMs: 5_000,
  }))

  expect(diagnostics).toEqual([{
    level: "debug",
    scope: "[@cosmos/startup:server]",
    event: "release process активирован",
    details: {
      env: "server",
      name: "@cosmos/release",
      pid: host.active.runtime.process.pid,
      version: "1.2.3",
    },
  }])
  await host.destroy()
  expect(await host.active.finished).toEqual({reason: "destroyed"})
})

test.serial("server startup reports an unavailable exact release without fallback", async () => {
  const {artifactPath, root} = await releaseLayout("ready")
  await rm(artifactPath)

  const {diagnostics} = await captureDiagnostics(async () => {
    await expect(startServerRelease({cosmosRoot: root})).rejects.toThrow(
      "Current server release artifact is missing",
    )
  })
  expect(diagnostics).toEqual([{
    level: "error",
    scope: "[@cosmos/startup:server]",
    event: "release process не запущен",
    details: {
      error: expect.stringContaining("Current server release artifact is missing"),
    },
  }])
})

test.serial("server startup observes one failed release process without restart", async () => {
  const {root} = await releaseLayout("exit-after-ready")
  const {result, diagnostics} = await captureDiagnostics(async () => {
    const host = await startServerRelease({cosmosRoot: root, readyTimeoutMs: 5_000})
    return {host, exit: await observeServerRelease(host)}
  })

  expect(result.exit.reason).toBe("failed")
  expect(diagnostics.map(({level, event}) => `${level}:${String(event)}`)).toEqual([
    "debug:release process активирован",
    "error:release process завершился с ошибкой",
  ])
  expect(diagnostics[1]?.details).toEqual({
    error: "Server package process exited with code 23",
    pid: result.host.active.runtime.process.pid,
    version: "1.2.3",
  })
})

async function releaseLayout(behavior: "ready" | "exit-after-ready") {
  const root = await mkdtemp(join(tmpdir(), "metafor-server-startup-"))
  directories.push(root)
  const releaseRoot = join(root, "release")
  const artifactPath = join(releaseRoot, "dist", "versions", "1.2.3", "server.js")
  const source = [
    'const identity = JSON.parse(process.env.COSMOS_PACKAGE_IDENTITY)',
    'process.send?.({type: "ready", identity})',
    behavior === "exit-after-ready"
      ? "setTimeout(() => process.exit(23), 10)"
      : 'await new Promise(resolve => process.once("SIGTERM", resolve))',
    "",
  ].join("\n")
  await mkdir(join(releaseRoot, "dist", "versions", "1.2.3"), {recursive: true})
  await Promise.all([
    Bun.write(join(root, "package.json"), JSON.stringify({name: "@metafor/cosmos"})),
    Bun.write(join(releaseRoot, "package.json"), JSON.stringify({
      name: "@cosmos/release",
      version: "1.2.3",
    })),
  ])
  await Bun.write(artifactPath, source)
  return {artifactPath, root, source}
}
