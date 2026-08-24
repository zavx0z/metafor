import {afterEach, expect, test} from "bun:test"
import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {
  createServerProcessExecutor,
  serverProcessCommand,
  type ServerProcessArtifact,
} from "../startup/server/executor"

const cosmos = fileURLToPath(new URL("../", import.meta.url))
const fixture = fileURLToPath(new URL("./fixture/package-process.ts", import.meta.url))
const directories: string[] = []
const identity = Object.freeze({
  name: "@cosmos/release",
  env: "server" as const,
  version: "1.2.3",
  sha256: "a".repeat(64),
  size: 321,
})

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, {recursive: true, force: true})))
})

test.serial("server executor prepares without a process and activates one exact Bun child", async () => {
  const directory = await temporaryDirectory()
  const observation = join(directory, "observation.json")
  const executor = createServerProcessExecutor()
  const candidate = await executor.prepare(artifact(), context("ready", observation, {
    args: ["fixture-argument"],
  }))

  expect(await Bun.file(observation).exists()).toBeFalse()
  const active = await executor.activate(candidate)
  expect(active.runtime.identity).toEqual(identity)
  expect(active.runtime.process.pid).toBeGreaterThan(0)

  const actual = JSON.parse(await readFile(observation, "utf8")) as Record<string, unknown>
  expect(actual).toEqual({
    argv: ["fixture-argument"],
    behavior: "ready",
    identity,
    marker: "exact-environment",
  })

  let finished = false
  void active.finished.then(() => { finished = true })
  await Promise.resolve()
  expect(finished).toBeFalse()

  await executor.destroy(active)
  expect(await active.finished).toEqual({reason: "destroyed"})
  expect(active.runtime.process.exitCode).toBe(0)
})

test("server executor places Bun Inspector before the exact artifact", async () => {
  expect(serverProcessCommand({
    artifact: artifact(),
    context: {
      cwd: cosmos,
      inspect: "127.0.0.1:6499",
    },
  })).toEqual([
    process.execPath,
    "--inspect=127.0.0.1:6499",
    "--conditions=cosmos:server",
    "--conditions=internal:server",
    fixture,
  ])
})

test.serial("server executor rejects one process that exits before ready without restart", async () => {
  const directory = await temporaryDirectory()
  const observation = join(directory, "observation.json")
  const executor = createServerProcessExecutor()
  const candidate = await executor.prepare(artifact(), context("exit-before-ready", observation))

  await expect(executor.activate(candidate)).rejects.toThrow(
    "Server package process exited before ready with code 17",
  )
  const actual = JSON.parse(await readFile(observation, "utf8")) as {behavior?: unknown}
  expect(actual.behavior).toBe("exit-before-ready")
})

test.serial("server executor rejects a ready message for another artifact identity", async () => {
  const directory = await temporaryDirectory()
  const observation = join(directory, "observation.json")
  const executor = createServerProcessExecutor()
  const candidate = await executor.prepare(artifact(), context("wrong-ready", observation))

  await expect(executor.activate(candidate)).rejects.toThrow(
    "Server package process sent invalid ready identity",
  )
  const actual = JSON.parse(await readFile(observation, "utf8")) as {behavior?: unknown}
  expect(actual.behavior).toBe("wrong-ready")
})

test.serial("server executor reports an unexpected exit after ready", async () => {
  const directory = await temporaryDirectory()
  const observation = join(directory, "observation.json")
  const executor = createServerProcessExecutor()
  const candidate = await executor.prepare(artifact(), context("exit-after-ready", observation))
  const active = await executor.activate(candidate)

  const exit = await active.finished
  expect(exit.reason).toBe("failed")
  if (exit.reason !== "failed") throw new Error("Expected failed package exit")
  expect(exit.error).toBeInstanceOf(Error)
  expect((exit.error as Error).message).toBe("Server package process exited with code 23")
  expect(active.runtime.process.exitCode).toBe(23)
})

function artifact(): ServerProcessArtifact {
  return Object.freeze({identity, executable: fixture})
}

function context(
  behavior: string,
  observation: string,
  options: {args?: readonly string[]} = {},
) {
  return Object.freeze({
    ...options,
    cwd: cosmos,
    env: Object.freeze({
      COSMOS_PACKAGE_FIXTURE_BEHAVIOR: behavior,
      COSMOS_PACKAGE_FIXTURE_MARKER: "exact-environment",
      COSMOS_PACKAGE_FIXTURE_OBSERVATION: observation,
    }),
    readyTimeoutMs: 5_000,
  })
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "metafor-package-executor-"))
  directories.push(directory)
  return directory
}
