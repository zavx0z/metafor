/** Отдельные Bun processes проходят staged handover без обращения к live Cosmos. */
import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {startServerRelease, startStagedServerRelease, type StagedServerReleaseHost, type ServerProcessCandidate} from "../index.ts"

const fixture = resolve(import.meta.dir, "fixture/process.ts")
const directories: string[] = []
const hosts: StagedServerReleaseHost[] = []

afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.destroy()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, {recursive: true, force: true})))
})

test("Первый выпуск фиксируется после bind и до admission", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {
      expect((await workspace.events()).map(entry => entry.event)).toEqual(["launch:prepared", "bind"])
    },
  })
  hosts.push(host)
  expect((await workspace.events()).map(entry => entry.event)).toEqual(["launch:prepared", "bind", "admit"])
})

test("Staged вход разрешает установленную цель без source package manifests", async () => {
  const workspace = await context()
  const host = await startServerRelease({
    cosmosRoot: workspace.directory,
    staged: true,
    initialTarget: "1.0.0",
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  try {
    expect(host.active.runtime.identity.version).toBe("1.0.0")
    expect(await Bun.file(join(workspace.directory, "package.json")).exists()).toBeFalse()
  } finally {
    await host.destroy()
  }
})

describe.each([
  {name: "Успешная передача", props: {failure: ""}, expected: {commits: 1, version: "1.1.0", phase: "complete"}},
  {name: "Отказ подготовки", props: {failure: "prepare"}, expected: {commits: 0, version: "1.0.0", phase: "failed"}},
  {name: "Чужая prepared identity", props: {failure: "wrong-prepared"}, expected: {commits: 0, version: "1.0.0", phase: "failed"}},
  {name: "Отказ bind после unbind", props: {failure: "bind"}, expected: {commits: 0, version: "1.0.0", phase: "failed"}},
  {name: "Отказ admission после commit", props: {failure: "admit"}, expected: {commits: 1, version: "1.1.0", phase: "failed"}},
])("$name", ({props, expected}) => {
  test("Доказанная граница переключения", async () => {
    const workspace = await context()
    const commits: string[] = []
    const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
      resolveCandidate: () => workspace.candidate("1.1.0", {STAGED_FIXTURE_FAILURE: props.failure}),
      commitCandidate: async candidate => { commits.push(candidate.artifact.identity.version) },
    })
    hosts.push(host)
    const previous = host.active
    let completed = false
    void host.finished.then(() => { completed = true })
    if (props.failure) await expect(host.handover("1.1.0")).rejects.toThrow()
    else await host.handover("1.1.0")
    expect(commits[0]).toBe("1.0.0")
    expect(commits.slice(1)).toHaveLength(expected.commits)
    expect(host.active.runtime.identity.version).toBe(expected.version)
    expect(host.transition?.phase).toBe(expected.phase)
    const events = await workspace.events()
    if (!props.failure) {
      expect(events.map(entry => `${entry.version}:${entry.event}`)).toEqual([
        "1.0.0:launch:prepared", "1.0.0:bind", "1.0.0:admit",
        "1.1.0:launch:prepared", "1.0.0:quiesce", "1.0.0:unbind",
        "1.1.0:bind", "1.1.0:admit", "1.0.0:destroy",
      ])
      expect(await previous.finished).toEqual({reason: "destroyed"})
      expect(completed).toBeFalse()
    } else if (props.failure === "prepare" || props.failure === "wrong-prepared") {
      expect(previous.runtime.process.exitCode).toBeNull()
      expect(events.some(entry => entry.event === "quiesce")).toBeFalse()
      expect(completed).toBeFalse()
    } else {
      expect((await host.finished).reason).toBe("failed")
      expect(events.some(entry => entry.event === "resume")).toBeFalse()
      await expect(host.handover("target")).rejects.toThrow("cannot accept another handover")
    }
  })
})

test("Отказ quiesce возвращает admission и не фиксирует новый выпуск", async () => {
  const workspace = await context()
  let commits = 0
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {STAGED_FIXTURE_FAILURE: "quiesce"}), {
    resolveCandidate: () => workspace.candidate("1.1.0"),
    commitCandidate: async () => { commits++ },
  })
  hosts.push(host)
  await expect(host.handover("1.1.0")).rejects.toThrow("fixture quiesce failed")
  expect(commits).toBe(1)
  expect(host.active.runtime.process.exitCode).toBeNull()
  expect((await workspace.events()).map(entry => entry.event)).toEqual([
    "launch:prepared", "bind", "admit", "launch:prepared", "quiesce", "destroy", "resume",
  ])
})

test("Повреждённый executable отвергается до рождения кандидата", async () => {
  const workspace = await context()
  const corrupt = await workspace.candidate("1.1.0")
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: async () => ({...corrupt, artifact: {...corrupt.artifact,
      identity: {...corrupt.artifact.identity, sha256: "a".repeat(64)}}}),
    commitCandidate: async candidate => {
      if (candidate.artifact.identity.version !== "1.0.0") throw new Error("Unexpected commit")
    },
  })
  hosts.push(host)
  await expect(host.handover("1.1.0")).rejects.toThrow("differs from its expected identity")
  expect((await workspace.events()).map(entry => entry.event)).toEqual(["launch:prepared", "bind", "admit"])
})

test("Повтор текущей identity не создаёт process и не пишет activation", async () => {
  const workspace = await context()
  const candidate = await workspace.candidate("1.0.0")
  let commits = 0
  const host = await startStagedServerRelease(candidate, {
    resolveCandidate: async () => candidate,
    commitCandidate: async () => { commits++ },
  })
  hosts.push(host)
  await host.handover("1.0.0")
  expect(commits).toBe(1)
  expect((await workspace.events()).map(entry => entry.event)).toEqual(["launch:prepared", "bind", "admit"])
})

test("Изменённый состав заменяется даже при прежних bytes server entrypoint", async () => {
  const workspace = await context()
  const initial = await workspace.candidate("1.0.0", {COSMOS_RELEASE_DIGEST: "composition-a"})
  const next = await workspace.candidate("1.0.0", {COSMOS_RELEASE_DIGEST: "composition-b"})
  let commits = 0
  const host = await startStagedServerRelease(initial, {
    resolveCandidate: async () => next,
    commitCandidate: async () => { commits++ },
  })
  hosts.push(host)
  const pid = host.active.runtime.process.pid
  const prepared = await host.prepare("composition-b")
  expect(host.active.runtime.process.pid).toBe(pid)
  expect((await workspace.events()).map(entry => entry.event)).toEqual(["launch:prepared", "bind", "admit"])
  await host.activate(prepared)
  expect(commits).toBe(2)
  expect(host.active.runtime.process.pid).not.toBe(pid)
})

test("Отказ durable commit после unbind завершает переход без rollback", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: () => workspace.candidate("1.1.0"),
    commitCandidate: async candidate => {
      if (candidate.artifact.identity.version !== "1.0.0") throw new Error("activation write failed")
    },
  })
  hosts.push(host)
  await expect(host.handover("1.1.0")).rejects.toThrow("activation write failed")
  expect((await host.finished).reason).toBe("failed")
  const events = await workspace.events()
  expect(events.some(entry => entry.event === "resume")).toBeFalse()
  expect(events.some(entry => entry.version === "1.1.0" && entry.event === "admit")).toBeFalse()
})

test("Два запроса active release с одним requestId выполняют одну передачу", async () => {
  const workspace = await context()
  let commits = 0
  let resolutions = 0
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {
    STAGED_FIXTURE_REQUEST_TARGET: "1.1.0", STAGED_FIXTURE_DUPLICATE_REQUEST: "1", STAGED_FIXTURE_REQUEST_ACTIVE: "1",
  }), {
    resolveCandidate: async () => { resolutions++; return await workspace.candidate("1.1.0") },
    commitCandidate: async () => { commits++ },
  })
  hosts.push(host)
  await waitFor(() => host.transition?.phase === "complete")
  expect(resolutions).toBe(1)
  expect(commits).toBe(2)
  const events = await workspace.events()
  expect(events.filter(entry => entry.event === "handover-result:true")).toHaveLength(1)
})

test("Подготовленный process не вправе назначать следующий переход", async () => {
  const workspace = await context()
  let resolutions = 0
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: async () => {
      resolutions++
      return await workspace.candidate("1.1.0", {STAGED_FIXTURE_REQUEST_TARGET: "forbidden-target"})
    },
    commitCandidate: async () => {},
  })
  hosts.push(host)
  await host.handover("1.1.0")
  expect(resolutions).toBe(1)
  expect((await workspace.events()).some(entry => entry.event === "handover-result:false")).toBeTrue()
})

test("Два разных перехода сериализуются поверх последнего active", async () => {
  const workspace = await context()
  const commits: string[] = []
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async candidate => { commits.push(candidate.artifact.identity.version) },
  })
  hosts.push(host)
  await Promise.all([host.handover("1.1.0"), host.handover("1.2.0")])
  expect(commits).toEqual(["1.0.0", "1.1.0", "1.2.0"])
  expect(host.active.runtime.identity.version).toBe("1.2.0")
  expect((await workspace.events()).filter(entry => entry.event === "quiesce").map(entry => entry.version))
    .toEqual(["1.0.0", "1.1.0"])
})

test("Host finished наблюдает отказ последнего active после передачи", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: () => workspace.candidate("1.1.0"),
    commitCandidate: async () => {},
  })
  hosts.push(host)
  await host.handover("1.1.0")
  host.active.runtime.process.kill("SIGKILL")
  expect((await host.finished).reason).toBe("failed")
})

test("Остановка host завершает оба принадлежащих process во время bind", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: () => workspace.candidate("1.1.0", {STAGED_FIXTURE_HOLD_BIND: "1"}),
    commitCandidate: async () => {},
  })
  hosts.push(host)
  const outcome = host.handover("1.1.0").catch(error => error)
  await waitFor(async () => (await workspace.events()).some(entry => entry.version === "1.1.0" && entry.event === "bind"))
  await host.destroy()
  expect(await outcome).toBeInstanceOf(Error)
  expect(await host.finished).toEqual({reason: "destroyed"})
  expect((await workspace.events()).filter(entry => entry.event === "destroy")).toHaveLength(2)
})

test("Неподчиняющийся owned child завершается по deadline с явным failed исходом", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {STAGED_FIXTURE_IGNORE_TERMINATION: "1"}), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  const first = host.destroy()
  expect(host.destroy()).toBe(first)
  await expect(first).rejects.toThrow("cleanup failed")
  expect((await host.finished).reason).toBe("failed")
  const exit = await host.active.finished
  expect(exit.reason).toBe("failed")
  if (exit.reason === "failed") expect(String(exit.error)).toContain("SIGKILL was required")
  expect(host.active.runtime.process.signalCode).toBe("SIGKILL")
  expect((await workspace.events()).some(entry => entry.event === "ignored-sigterm")).toBeTrue()
})

test("Обычный SIGTERM без cleanup handler сохраняет graceful destroyed исход", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {STAGED_FIXTURE_DEFAULT_SIGTERM: "1"}), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  hosts.push(host)
  await host.destroy()
  expect(await host.active.finished).toEqual({reason: "destroyed"})
  expect(host.active.runtime.process.signalCode).toBe("SIGTERM")
})

test("Ошибка завершения predecessor не уничтожает уже admitted новый runtime", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {STAGED_FIXTURE_IGNORE_TERMINATION: "1"}), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  hosts.push(host)
  const previous = host.active
  await expect(host.handover("1.1.0")).rejects.toThrow("SIGKILL was required")
  expect(host.active.runtime.identity.version).toBe("1.1.0")
  expect(host.active.runtime.process.exitCode).toBeNull()
  expect(previous.runtime.process.signalCode).toBe("SIGKILL")
  expect(host.transition?.phase).toBe("failed")
  expect((await host.finished).reason).toBe("failed")
})

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2_000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error("Fixture handover did not complete")
    await Bun.sleep(5)
  }
}

async function context() {
  const directory = await mkdtemp(join(tmpdir(), "cosmos-staged-startup-"))
  directories.push(directory)
  const log = join(directory, "events.jsonl")
  const integrity = await artifactIntegrity(await Bun.file(fixture).arrayBuffer())
  return {
    directory,
    async candidate(version: string, env: Record<string, string> = {}): Promise<ServerProcessCandidate> {
      return {
        artifact: {executable: fixture, identity: {name: "@cosmos/release", env: "server", version, ...integrity}},
        context: {cwd: directory, env: {COSMOS_RELEASE_DIGEST: version, STAGED_FIXTURE_LOG: log, ...env},
          readyTimeoutMs: 2_000, terminationTimeoutMs: 100},
      }
    },
    async events(): Promise<{version: string; event: string}[]> {
      return (await Bun.file(log).text()).trim().split("\n").map(line => JSON.parse(line))
    },
  }
}
