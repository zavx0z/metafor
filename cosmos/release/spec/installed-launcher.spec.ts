/** SQLite ownership проверяется в изолированном installed root с настоящими Bun children. */
import {afterEach, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph} from "@metafor/tech-release/installed"
import {runInstalledCosmos, startInstalledCosmos} from "../../installed.ts"

const roots: string[] = []
const runtimes: Awaited<ReturnType<typeof startInstalledCosmos>>[] = []
const processes: ReturnType<typeof Bun.spawn>[] = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.destroy()))
  await Promise.all(processes.splice(0).map(async child => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    await child.exited
  }))
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))
})

test("Из двух параллельных startup только один получает installed root", async () => {
  const workspace = await fixture()
  const results = await Promise.allSettled([
    startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest}),
    startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest}),
  ])
  const started = results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
  runtimes.push(...started)
  expect(started).toHaveLength(1)
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
  expect((await workspace.store.readActive())?.digest).toBe(workspace.digest)
})

test("Concurrent destroy сохраняет ownership до завершения owned child", async () => {
  const workspace = await fixture()
  const runtime = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})
  runtimes.push(runtime)
  const first = runtime.destroy()
  expect(runtime.destroy()).toBe(first)
  await waitFor(async () => await Bun.file(join(workspace.root, "shutdown.started")).exists())
  await expect(startInstalledCosmos({storeRoot: workspace.root})).rejects.toThrow("live launcher")
  await first
  const cold = await startInstalledCosmos({storeRoot: workspace.root})
  runtimes.push(cold)
  expect(cold.host.active.runtime.identity.version).toBe("1.0.0")
  expect((await cold.store.readActive())?.digest).toBe(workspace.digest)
})

test("Падение process снимает SQLite lock без stale PID или reclaim cleanup", async () => {
  const workspace = await fixture()
  const child = Bun.spawn([process.execPath, "--eval", `
    const {Database} = await import('bun:sqlite')
    const database = new Database(${JSON.stringify(join(workspace.root, "launcher.sqlite"))}, {create: true})
    database.exec('BEGIN EXCLUSIVE')
    console.log('locked')
    setInterval(() => {}, 1000)
  `], {stdout: "pipe", stderr: "pipe"})
  processes.push(child)
  const reader = child.stdout.getReader()
  try {
    const status = await Promise.race([
      reader.read(),
      Bun.sleep(2_000).then(() => { throw new Error("SQLite fixture did not acquire ownership") }),
    ])
    expect(new TextDecoder().decode(status.value)).toContain("locked")
  } finally { reader.releaseLock() }
  await expect(startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})).rejects.toThrow("live launcher")
  child.kill("SIGKILL")
  await child.exited
  const runtime = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})
  runtimes.push(runtime)
  expect(runtime.host.active.runtime.identity.version).toBe("1.0.0")
})

for (const stage of ["prepare", "bind"] as const) {
  test(`Отмена initial ${stage} подтверждает выход child до освобождения lock`, async () => {
    const workspace = await fixture()
    const cancellation = new AbortController()
    const reason = new Error("operator cancelled startup")
    const startup = startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest,
      signal: cancellation.signal, environment: {LAUNCHER_FIXTURE_HOLD: stage}})
    const rejected = startup.catch(error => error)
    await waitFor(async () => await Bun.file(join(workspace.root, stage === "prepare" ? "process.started" : "bind.started")).exists())
    const pid = Number(await Bun.file(join(workspace.root, "process.started")).text())
    cancellation.abort(reason)
    expect(await rejected).toBe(reason)
    expect(() => process.kill(pid, 0)).toThrow()
    expect(await workspace.store.readActive()).toBeNull()
    const cold = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})
    runtimes.push(cold)
    expect(cold.host.ownedProcessesExited).toBeFalse()
  })
}

test("runInstalledCosmos отменяет незавершённый startup и возвращает освобождённый lock", async () => {
  const workspace = await fixture()
  const cancellation = new AbortController()
  const running = runInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest,
    signal: cancellation.signal, environment: {LAUNCHER_FIXTURE_HOLD: "prepare"}})
  await waitFor(async () => await Bun.file(join(workspace.root, "process.started")).exists())
  cancellation.abort(new DOMException("operator stop", "AbortError"))
  await running
  const cold = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})
  runtimes.push(cold)
})

test("SIGTERM во время initial startup ждёт owned child cleanup и завершает launcher", async () => {
  const workspace = await fixture()
  const launcher = resolve(import.meta.dir, "../../installed.ts")
  const child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", "--eval",
    `const {runInstalledCosmos} = await import(${JSON.stringify(launcher)}); await runInstalledCosmos(${JSON.stringify({storeRoot: workspace.root,
      initialDigest: workspace.digest, environment: {LAUNCHER_FIXTURE_HOLD: "prepare"}})})`], {stdout: "pipe", stderr: "pipe"})
  processes.push(child)
  await waitFor(async () => await Bun.file(join(workspace.root, "process.started")).exists())
  const pid = Number(await Bun.file(join(workspace.root, "process.started")).text())
  child.kill("SIGTERM")
  expect(await child.exited).toBe(0)
  expect(await Bun.file(join(workspace.root, "shutdown.started")).exists()).toBeTrue()
  expect(() => process.kill(pid, 0)).toThrow()
  expect(await new Response(child.stderr).text()).toBe("")
  const cold = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest})
  runtimes.push(cold)
})

test("Fatal active child отклоняет run без ожидания stop и освобождает lock", async () => {
  const workspace = await fixture()
  await expect(runInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest,
    environment: {LAUNCHER_FIXTURE_FATAL: "1"}})).rejects.toThrow("code 23")
  const cold = await startInstalledCosmos({storeRoot: workspace.root})
  runtimes.push(cold)
})

test("Cleanup failure освобождает lock только после подтверждённого failed child exit", async () => {
  const workspace = await fixture()
  const runtime = await startInstalledCosmos({storeRoot: workspace.root, initialDigest: workspace.digest,
    environment: {LAUNCHER_FIXTURE_FAIL_STOP: "1"}})
  const stopped = runtime.destroy()
  await waitFor(async () => await Bun.file(join(workspace.root, "shutdown.started")).exists())
  await expect(startInstalledCosmos({storeRoot: workspace.root})).rejects.toThrow("live launcher")
  await expect(stopped).rejects.toThrow("cleanup failed")
  expect(runtime.host.ownedProcessesExited).toBeTrue()
  expect(runtime.host.active.runtime.process.exitCode).toBe(1)
  const cold = await startInstalledCosmos({storeRoot: workspace.root})
  runtimes.push(cold)
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "installed-launcher-"))
  roots.push(root)
  const bytes = Buffer.from(`
    const identity = JSON.parse(process.env.COSMOS_PACKAGE_IDENTITY)
    const transitionId = process.env.COSMOS_PROCESS_TRANSITION
    await Bun.write('process.started', String(process.pid))
    process.on('message', async command => {
      if (command.type === 'bind') {
        await Bun.write('bind.started', '1')
        if (process.env.LAUNCHER_FIXTURE_HOLD === 'bind') return
      }
      const type = {bind: 'ready', admit: 'admitted', quiesce: 'quiesced', resume: 'resumed', unbind: 'unbound'}[command.type]
      if (type) process.send({type, identity, transitionId: command.transitionId})
      if (command.type === 'admit' && process.env.LAUNCHER_FIXTURE_FATAL) setTimeout(() => process.exit(23), 25)
    })
    process.once('SIGTERM', async () => {
      await Bun.write('shutdown.started', '1')
      await Bun.sleep(150)
      process.exit(process.env.LAUNCHER_FIXTURE_FAIL_STOP ? 1 : 0)
    })
    if (process.env.LAUNCHER_FIXTURE_HOLD !== 'prepare') process.send({type: 'prepared', identity, transitionId})
    setInterval(() => {}, 1000)
  `)
  const output = {artifact: ".", kind: "entry-point", type: "text/javascript", load: "eager",
    sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length}
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@cosmos/release", version: "1.0.0", dependencies: {},
    environments: [{env: "server", publicArtifacts: {}, outputs: [output]}],
  }]})
  const store = createInstalledReleaseStore({root})
  const candidate = await store.prepare(graph, {async read() { return bytes }})
  return {root, store, digest: candidate.digest}
}

async function waitFor(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 2_000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error("Launcher fixture did not reach shutdown")
    await Bun.sleep(5)
  }
}
