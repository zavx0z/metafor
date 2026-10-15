import {expect, test} from "bun:test"
import {mkdtemp, mkdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {serverProcessCommandMessage, serverProcessIdentityEnvironment, serverProcessLaunchEnvironment} from "../../shared/package/process"

test("Concurrent destroy сохраняет исходный bind failure после освобождения Quantum и listener", async () => {
  const {result, diagnostics} = await installedFixture(bindRecoveryFixture)
  expect(diagnostics).not.toContain("TypeError")
  expect(diagnostics).not.toContain("Unhandled")
  expect(result.originalPreserved).toBeTrue()
  expect(result.errors).toContainEqual({name: "Error", message: "original bind failure"})
  expect(result.errors.some((error: {name: string}) => error.name === "TypeError")).toBeFalse()
  expect(result.closeCalls).toBeGreaterThanOrEqual(2)
  expect(result.released).toBe(1)
  expect(result.listenerClosed).toBeTrue()
}, 10_000)

test("Destroy закрывает Quantum при ожидающем Source и возвращается только после обоих owners", async () => {
  const {result, diagnostics} = await installedFixture(delayedSourceFixture)
  expect(diagnostics).not.toContain("Unhandled")
  expect(result.beforeSourceSettled).toEqual({quantumClosed: true, sourceClosed: false, destroySettled: false})
  expect(result.events).toEqual(["source-closing", "quantum-closed", "source-closed", "destroy-settled"])
  expect(result.listenerClosed).toBeTrue()
}, 10_000)

async function installedFixture(body: () => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "installed-bind-recovery-"))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    const store = createInstalledReleaseStore({root: directory})
    const bytes = new TextEncoder().encode("export default {}")
    const integrity = await artifactIntegrity(bytes.buffer)
    const identity = {name: "@cosmos/release", version: "1.0.0", env: "server" as const, ...integrity}
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: identity.name, version: identity.version,
      dependencies: {}, environments: [{env: "server", publicArtifacts: {},
        outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", ...integrity}]}]}]}
    const candidate = await store.prepare(graph, {async read() {return bytes}})
    const stateRoot = join(directory, "state")
    await mkdir(stateRoot)
    child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", "--eval",
      `await (${body.toString()})()`], {
      cwd: import.meta.dir,
      env: {PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
        ...serverProcessIdentityEnvironment(identity), ...serverProcessLaunchEnvironment({mode: "prepared", transitionId: "initial"}),
        COSMOS_BIND_FIXTURE: JSON.stringify({storeRoot: directory, stateRoot, digest: candidate.digest,
          runtimePath: resolve(import.meta.dir, "../server/installed/runtime.ts"),
          quantumPath: resolve(import.meta.dir, "../server/quantum.ts"),
          developmentPath: resolve(import.meta.dir, "../server/development.ts"),
          controlPath: resolve(import.meta.dir, "../server/installed/control.ts"),
          bind: serverProcessCommandMessage("bind", identity, "initial")})},
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = new Response(child.stdout as ReadableStream<Uint8Array>).text()
    const stderr = new Response(child.stderr as ReadableStream<Uint8Array>).text()
    const exited = await Promise.race([child.exited, Bun.sleep(5_000).then(() => {throw new Error("Bind cleanup fixture did not finish")})])
    expect(exited).toBe(0)
    const output = await stdout
    const marker = output.lastIndexOf("FIXTURE_RESULT:")
    if (marker < 0) throw new Error(`Fixture result is missing: ${await stderr}`)
    const diagnostics = `${await stderr}\n${output.slice(0, marker)}`
    const result = JSON.parse(output.slice(marker + "FIXTURE_RESULT:".length))
    return {result, diagnostics}
  } finally {
    if (child?.exitCode === null) child.kill("SIGKILL")
    await child?.exited
    await rm(directory, {recursive: true, force: true})
  }
}

async function bindRecoveryFixture() {
  const fixture = JSON.parse(process.env.COSMOS_BIND_FIXTURE!)
  const {mock} = await import("bun:test")
  const start = Promise.withResolvers<void>()
  const started = Promise.withResolvers<number>()
  const closed = Promise.withResolvers<void>()
  const prepared = Promise.withResolvers<void>()
  const original = new Error("original bind failure")
  let closeCalls = 0, released = 0, closing: Promise<void> | undefined
  const quantum = {
    async start(port: number) {
      started.resolve(port)
      await start.promise
    },
    close() {
      closeCalls++
      closing ??= Promise.resolve().then(() => {
        released++
        closed.resolve()
      })
      return closing
    },
    failure: new Promise<void>(() => {}),
    handles() {return false},
    observeDomains() {return null},
    authorizeObservation() {return false},
  }
  mock.module(fixture.quantumPath, () => ({async prepareQuantumRuntime() {return quantum}}))
  process.send = ((value: {type?: string}) => {
    if (value.type === "prepared") prepared.resolve()
    return true
  }) as NonNullable<typeof process.send>
  const {runInstalledRelease} = await import(fixture.runtimePath)
  const running = runInstalledRelease({storeRoot: fixture.storeRoot, digest: fixture.digest, port: 0,
    quantum: {stateRoot: fixture.stateRoot, sources: []}}).then(
    () => {throw new Error("Pending bind unexpectedly succeeded")},
    (error: unknown) => error,
  )
  await prepared.promise
  process.emit("message", fixture.bind)
  const port = await started.promise
  process.emit("SIGTERM")
  await closed.promise
  await Bun.sleep(0)
  start.reject(original)
  const error = await running
  function errors(value: unknown): Error[] {
    return value instanceof AggregateError ? value.errors.flatMap(errors) : value instanceof Error ? [value] : []
  }
  const failures = errors(error)
  const listenerClosed = await fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(1_000)}).then(() => false, () => true)
  process.stdout.write("FIXTURE_RESULT:" + JSON.stringify({originalPreserved: failures.includes(original),
    errors: failures.map(error => ({name: error.name, message: error.message})), closeCalls, released, listenerClosed}))
}

async function delayedSourceFixture() {
  const fixture = JSON.parse(process.env.COSMOS_BIND_FIXTURE!)
  const {mock} = await import("bun:test")
  const releaseSource = Promise.withResolvers<void>()
  const quantumClosing = Promise.withResolvers<void>()
  const events: string[] = []
  let sourceClosed = false, quantumClosed = false, destroySettled = false
  let application: {bind(): Promise<void>; destroy(): Promise<void>} | undefined
  mock.module(fixture.controlPath, () => ({async attachServerProcessControl(runtime: typeof application) {
    application = runtime
    return {bound: runtime!.bind(), destroy: () => runtime!.destroy()}
  }}))
  mock.module(fixture.developmentPath, () => ({configuredOptionalDevelopment() {
    return {async close() {
      events.push("source-closing")
      await releaseSource.promise
      sourceClosed = true
      events.push("source-closed")
    }}
  }}))
  mock.module(fixture.quantumPath, () => ({async prepareQuantumRuntime() {
    return {async start() {}, async close() {
      quantumClosed = true
      events.push("quantum-closed")
      quantumClosing.resolve()
    }, failure: new Promise<void>(() => {}), handles() {return false}, observeDomains() {return null}, authorizeObservation() {return false}}
  }}))
  const {runInstalledRelease} = await import(fixture.runtimePath)
  const server = await runInstalledRelease({storeRoot: fixture.storeRoot, digest: fixture.digest, port: 0,
    quantum: {stateRoot: fixture.stateRoot, sources: []}})
  const port = server.port
  const destroying = application!.destroy().then(() => {
    destroySettled = true
    events.push("destroy-settled")
  })
  await quantumClosing.promise
  await Bun.sleep(0)
  const beforeSourceSettled = {quantumClosed, sourceClosed, destroySettled}
  releaseSource.resolve()
  await destroying
  const listenerClosed = await fetch(`http://127.0.0.1:${port}`, {signal: AbortSignal.timeout(1_000)}).then(() => false, () => true)
  process.stdout.write("FIXTURE_RESULT:" + JSON.stringify({beforeSourceSettled, events, listenerClosed}))
}
