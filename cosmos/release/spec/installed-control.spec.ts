/** Реальный process IPC и test-owned HTTP проверяют control adapter вместе со startup. */
import {afterEach, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {startStagedServerRelease, type ServerProcessCandidate, type StagedServerReleaseHost} from "../../startup/server/index.ts"
import {serverProcessCommandMessage, serverProcessIdentityEnvironment, serverProcessLaunchEnvironment,
  type ServerProcessIdentity} from "../../shared/package/process"

const fixture = resolve(import.meta.dir, "fixture/installed-control-process.ts")
const roots: string[] = []
const hosts: StagedServerReleaseHost[] = []
const processes: ReturnType<typeof Bun.spawn>[] = []

afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.destroy()))
  await Promise.all(processes.splice(0).map(async child => {
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
  }))
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))
})

test("Подготовленный HTTP listener принимает работу только после durable initial commit", async () => {
  const workspace = await context()
  let origin = ""
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {
      origin = await workspace.origin()
      expect((await fetch(origin)).status).toBe(503)
    },
  })
  hosts.push(host)
  expect(await (await fetch(origin)).text()).toBe("1.0.0")
})

test("Реальный HTTP handover завершает уже принятый запрос и заменяет один listener", async () => {
  const workspace = await context()
  let port = 0
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0"), {
    resolveCandidate: target => workspace.candidate(target, {PORT: String(port)}),
    commitCandidate: async () => { port = Number(new URL(await workspace.origin()).port) },
  })
  hosts.push(host)
  const origin = await workspace.origin()
  const accepted = fetch(`${origin}/hold`)
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "request-start"))
  await host.handover("1.1.0")
  expect(await (await accepted).text()).toBe("1.0.0")
  expect(await (await fetch(origin)).text()).toBe("1.1.0")
  const events = await workspace.events()
  const completed = events.findIndex(entry => entry.event === "request-complete")
  const unbound = events.findIndex(entry => entry.event === "unbind")
  const nextBound = events.findIndex(entry => entry.version === "1.1.0" && entry.event === "bind-end")
  expect(completed).toBeLessThan(unbound)
  expect(unbound).toBeLessThan(nextBound)
})

test("Отказ quiesce восстанавливает admission прежнего HTTP runtime", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {INSTALLED_CONTROL_FIXTURE_FAIL_QUIESCE: "1"}), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  hosts.push(host)
  const origin = await workspace.origin()
  await expect(host.handover("1.1.0")).rejects.toThrow("fixture quiesce failed")
  expect(await (await fetch(origin)).text()).toBe("1.0.0")
  expect((await workspace.events()).some(entry => entry.event === "resume")).toBeTrue()
})

test("Чужой transitionId не открывает listener, следующий корректный bind работает", async () => {
  const workspace = await context()
  const child = await workspace.raw()
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "stale"))
  const failure = await child.message(value => value.type === "failed")
  expect(failure.error).toBe("Release transition identity differs")
  expect((await workspace.events()).some(entry => entry.event === "bind-start")).toBeFalse()
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await child.message(value => value.type === "ready")
  expect((await fetch(await workspace.origin())).status).toBe(503)
})

test("Destroy ожидает текущий bind и не оставляет listener после cleanup", async () => {
  const workspace = await context()
  const child = await workspace.raw({INSTALLED_CONTROL_FIXTURE_HOLD_BIND: "1"})
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "bind-start"))
  child.process.send(serverProcessCommandMessage("admit", child.identity, "initial"))
  child.process.send({type: "fixture-destroy"})
  child.process.send({type: "fixture-release-bind"})
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "bind-end"))
  await child.message(value => value.type === "fixture-destroyed")
  await expect(fetch(await workspace.origin())).rejects.toThrow()
  const events = await workspace.events()
  expect(events.some(entry => entry.event === "admit")).toBeFalse()
  expect(events.filter(entry => entry.event === "destroy" && entry.resources === 1)).toHaveLength(1)
})

test("Destroy отклоняет pending handover request и освобождает listener единожды", async () => {
  const workspace = await context()
  const child = await workspace.raw()
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await child.message(value => value.type === "ready")
  child.process.send(serverProcessCommandMessage("admit", child.identity, "initial"))
  await child.message(value => value.type === "admitted")
  child.process.send({type: "fixture-request"})
  await child.message(value => value.type === "handover-request")
  child.process.send({type: "fixture-destroy"})
  await child.message(value => value.type === "fixture-destroyed")
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "request-rejected"))
  child.process.send({type: "fixture-destroy"})
  await child.message(value => value.type === "fixture-destroyed")
  const events = await workspace.events()
  expect(events.find(entry => entry.event === "request-rejected")?.error).toBe("Server release was destroyed")
  expect(events.filter(entry => entry.event === "destroy" && entry.resources === 1)).toHaveLength(1)
})

test("Установленный launcher загружается отдельным Bun process без старта production runtime", async () => {
  const launcher = resolve(import.meta.dir, "../../installed.ts")
  const child = Bun.spawn([process.execPath, "--conditions=cosmos:server", "--conditions=internal:server", "--eval",
    `const value = await import(${JSON.stringify(launcher)}); if (typeof value.startInstalledCosmos !== 'function') throw new Error('Launcher export missing')`],
  {stdout: "pipe", stderr: "pipe"})
  processes.push(child)
  const [exit, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect(error).toBe("")
  expect(exit).toBe(0)
})

test("Ошибка cleanup возвращает caller AggregateError после второй попытки освобождения listener", async () => {
  const workspace = await context()
  const child = await workspace.raw({INSTALLED_CONTROL_FIXTURE_FAIL_DESTROY_ONCE: "1"})
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await child.message(value => value.type === "ready")
  const origin = await workspace.origin()
  child.process.send({type: "fixture-destroy"})
  const failure = await child.message(value => value.type === "fixture-destroy-failed")
  expect(failure.error).toBe("Server release cleanup failed")
  expect(failure.aggregate).toBeTrue()
  expect(failure.errors).toEqual(["Error: fixture destroy failed"])
  await expect(fetch(origin)).rejects.toThrow()
  const events = await workspace.events()
  expect(events.some(entry => entry.event === "destroy-failure")).toBeTrue()
  expect(events.some(entry => entry.event === "destroy" && entry.resources === 1)).toBeTrue()
})

test("SIGTERM cleanup failure даёт child code1 и failed parent outcome без unhandled rejection", async () => {
  const workspace = await context()
  const host = await startStagedServerRelease(await workspace.candidate("1.0.0", {INSTALLED_CONTROL_FIXTURE_FAIL_DESTROY_ONCE: "1"}), {
    resolveCandidate: target => workspace.candidate(target),
    commitCandidate: async () => {},
  })
  const origin = await workspace.origin()
  await expect(host.destroy()).rejects.toThrow("cleanup failed")
  const outcome = await host.active.finished
  expect(outcome.reason).toBe("failed")
  if (outcome.reason === "failed") expect(String(outcome.error)).toContain("code 1")
  expect((await host.finished).reason).toBe("failed")
  expect(host.active.runtime.process.exitCode).toBe(1)
  await expect(fetch(origin)).rejects.toThrow()
})

test("Cleanup failure во время pending bind всё равно закрывает поздний listener и выходит nonzero", async () => {
  const workspace = await context()
  const child = await workspace.raw({INSTALLED_CONTROL_FIXTURE_FAIL_DESTROY_ONCE: "1", INSTALLED_CONTROL_FIXTURE_HOLD_BIND: "1"})
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "bind-start"))
  child.process.kill("SIGTERM")
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "destroy-failure"))
  child.process.send({type: "fixture-release-bind"})
  expect(await child.process.exited).toBe(1)
  await expect(fetch(await workspace.origin())).rejects.toThrow()
  const events = await workspace.events()
  expect(events.some(entry => entry.event === "destroy" && entry.resources === 1)).toBeTrue()
  expect(await child.stderr()).toBe("")
})

test("SIGTERM во время уже начатого cleanup ожидает освобождение listener", async () => {
  const workspace = await context()
  const child = await workspace.raw({INSTALLED_CONTROL_FIXTURE_DELAY_DESTROY: "1"})
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await child.message(value => value.type === "ready")
  const origin = await workspace.origin()
  child.process.send({type: "fixture-destroy"})
  await waitFor(async () => (await workspace.events()).some(entry => entry.event === "destroy-wait"))
  child.process.kill("SIGTERM")
  expect(await child.process.exited).toBe(0)
  expect((await workspace.events()).some(entry => entry.event === "destroy" && entry.resources === 1)).toBeTrue()
  await expect(fetch(origin)).rejects.toThrow()
  expect(await child.stderr()).toBe("")
})

test("Disconnect cleanup failure завершается code1 без unhandled rejection", async () => {
  const workspace = await context()
  const child = await workspace.raw({INSTALLED_CONTROL_FIXTURE_FAIL_DESTROY_ONCE: "1"})
  await child.message(value => value.type === "prepared")
  child.process.send(serverProcessCommandMessage("bind", child.identity, "initial"))
  await child.message(value => value.type === "ready")
  const origin = await workspace.origin()
  child.process.disconnect()
  expect(await child.process.exited).toBe(1)
  await expect(fetch(origin)).rejects.toThrow()
  expect(await child.stderr()).toBe("")
})

async function context() {
  const root = await mkdtemp(join(tmpdir(), "installed-control-"))
  roots.push(root)
  const log = join(root, "events.jsonl")
  await Bun.write(log, "")
  const integrity = await artifactIntegrity(await Bun.file(fixture).arrayBuffer())
  const candidate = async (version: string, env: Record<string, string> = {}): Promise<ServerProcessCandidate> => ({
    artifact: {executable: fixture, identity: {name: "@cosmos/release", env: "server", version, ...integrity}},
    context: {cwd: root, readyTimeoutMs: 2_000, env: {COSMOS_RELEASE_DIGEST: version, INSTALLED_CONTROL_FIXTURE_LOG: log, PORT: "0", ...env}},
  })
  const events = async (): Promise<{version: string; event: string; port?: number; error?: string; resources?: number}[]> =>
    (await Bun.file(log).text()).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
  return {
    candidate,
    events,
    async origin() {
      const event = (await events()).findLast(entry => entry.event === "bind-end")
      if (!event?.port) throw new Error("Fixture did not bind")
      return `http://127.0.0.1:${event.port}`
    },
    async raw(env: Record<string, string> = {}) {
      const value = await candidate("1.0.0", env)
      const identity = value.artifact.identity
      const messages: Record<string, unknown>[] = []
      const child = Bun.spawn([process.execPath, "--conditions=cosmos:server", fixture], {
        cwd: root, stdout: "pipe", stderr: "pipe", env: {...process.env, ...value.context.env,
          ...serverProcessIdentityEnvironment(identity), ...serverProcessLaunchEnvironment({mode: "prepared", transitionId: "initial"})},
        ipc(message) { messages.push(message as Record<string, unknown>) },
      })
      processes.push(child)
      return {
        process: child,
        identity: identity as ServerProcessIdentity,
        stderr: () => new Response(child.stderr).text(),
        async message(predicate: (value: Record<string, unknown>) => boolean) {
          await waitFor(() => messages.some(predicate))
          return messages.splice(messages.findIndex(predicate), 1)[0]!
        },
      }
    },
  }
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2_000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error("Control fixture did not reach expected boundary")
    await Bun.sleep(5)
  }
}
