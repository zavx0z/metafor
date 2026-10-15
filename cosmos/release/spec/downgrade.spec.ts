import {afterEach, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdir, mkdtemp, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph, type PublishedReleaseOutput} from "@metafor/tech-release/installed"
import {startInstalledCosmos} from "../../installed"
import {installedReleaseStoreIdentity, prepareInstalledReleaseSelection, verifyInstalledReleaseSelection} from "../../selection"
import type {ReleaseManagementSnapshot} from "../shared/management"
import {applyLiveReleaseSelection} from "../../../.agents/skills/metafor-dev/scripts/release-selection"

const roots: string[] = []
const runtimes: Awaited<ReturnType<typeof startInstalledCosmos>>[] = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.destroy()))
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))
})

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cosmos-downgrade-")))
  roots.push(root)
  const stateRoot = join(root, "instance")
  await mkdir(stateRoot)
  const state = {
    "world.json": {worldId: "world-kept", atoms: [{id: "atom-kept", value: 42}]},
    "profiles.json": {profiles: [{id: "profile-kept", name: "local"}]},
    "conversations.json": {conversations: [{id: "conversation-kept", messages: [{id: "message-kept", text: "сохранить"}]}]},
  }
  const original = new Map<string, string>()
  for (const [file, value] of Object.entries(state)) {
    const bytes = `${JSON.stringify(value, null, 2)}\n`
    original.set(file, bytes)
    await Bun.write(join(stateRoot, file), bytes)
  }
  const probe = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response()})
  const port = probe.port!
  await probe.stop(true)
  const store = createInstalledReleaseStore({root})
  const log = join(root, "lifecycle.jsonl")
  const options = {storeRoot: root, port, environment: {DOWNGRADE_STATE_ROOT: stateRoot, DOWNGRADE_LOG: log}}
  const start = async (extra: Partial<Parameters<typeof startInstalledCosmos>[0]> = {}) => {
    const runtime = await startInstalledCosmos({...options, ...extra})
    runtimes.push(runtime)
    return runtime
  }
  const request = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init)
  const events = async () => await Bun.file(log).exists() ? await Bun.file(log).text() : ""
  const assertState = async () => {
    for (const [file, bytes] of original) expect(await Bun.file(join(stateRoot, file)).text()).toBe(bytes)
    expect(await (await request("/state")).json()).toEqual(state)
  }
  return {root, store, state, original, stateRoot, start, request, events, assertState, origin: `http://127.0.0.1:${port}`}
}

async function candidate(store: ReturnType<typeof createInstalledReleaseStore>, version: string, line: string | null = "fixture-state:1", brokenUi = false, failAdmission = false) {
  const bytes = new Map<string, Uint8Array>()
  const output = (artifact: PublishedReleaseOutput["artifact"], text: string, kind: PublishedReleaseOutput["kind"]): PublishedReleaseOutput => {
    const body = Buffer.from(text)
    const sha256 = createHash("sha256").update(body).digest("hex")
    bytes.set(sha256, body)
    return {artifact, kind, type: kind === "asset" ? "application/json" : "text/javascript", sha256, size: body.length,
      ...(artifact === "." ? {load: "eager" as const} : {})}
  }
  const control = resolve(import.meta.dir, "../server/installed/control.ts")
  const management = resolve(import.meta.dir, "../server/installed/management.ts")
  const source = `
    import {appendFileSync} from 'node:fs'
    import {join} from 'node:path'
    import {attachServerProcessControl} from ${JSON.stringify(control)}
    import {createReleaseManagement} from ${JSON.stringify(management)}
    const version = ${JSON.stringify(version)}
    const record = event => appendFileSync(process.env.DOWNGRADE_LOG, JSON.stringify({version, event, pid: process.pid}) + '\\n')
    let server = null, admitted = false, control
    const management = createReleaseManagement({storeRoot: process.env.COSMOS_RELEASE_STORE,
      request: (selection, id) => control.requestHandover(selection.target, 5000, {kind: selection.kind, expected: selection.expected}, id),
      defer: work => setTimeout(() => {void work()}, 0),
    })
    control = await attachServerProcessControl({
      async bind() {
        server = Bun.serve({hostname: '127.0.0.1', port: Number(process.env.PORT), async fetch(request) {
          if (!admitted) return new Response('not admitted', {status: 503})
          const path = new URL(request.url).pathname
          if (path === '/release/manage') {
            const response = await management.fetch(request, server)
            response.headers.set('X-Cosmos-Release', process.env.COSMOS_RELEASE_DIGEST)
            return response
          }
          if (path === '/state') {
            const state = {}
            for (const file of ['world.json', 'profiles.json', 'conversations.json'])
              state[file] = await Bun.file(join(process.env.DOWNGRADE_STATE_ROOT, file)).json()
            return Response.json(state)
          }
          if (path === '/version') return new Response(version)
          return new Response(${JSON.stringify(brokenUi ? "broken browser UI" : "working browser UI")}, {status: ${brokenUi ? 500 : 200}})
        }})
        record('bind')
      },
      async admit() {
        if (${failAdmission}) { record('admit-failed'); throw new Error('fixture admission failed') }
        admitted = true
        record('admit')
      },
      async quiesce() { admitted = false; record('quiesce') },
      async resume() { admitted = true; record('resume') },
      async unbind() { await server?.stop(false); server = null; record('unbind') },
      async destroy() { admitted = false; await server?.stop(true); server = null; record('destroy') },
    })
  `
  const outputs = [output(".", source, "entry-point")]
  if (line !== null) outputs.push(output("./persisted-state.json", JSON.stringify({version: 1, compatibilityLine: line}), "asset"))
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@cosmos/release", version, dependencies: {}, environments: [{
      env: "server", publicArtifacts: line === null ? {} : {"./persisted-state.json": ".json"}, outputs,
    }],
  }]})
  return await store.prepare(graph, {async read(identity) {
    const body = bytes.get(identity.sha256)
    if (!body) throw new Error("Fixture artifact missing")
    return body
  }})
}

test("явный downgrade работает при HTTP 500 UI, выбирает successful A вместо ready C и сохраняется после restart", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1", "fixture-state:1", true)
  const c = await candidate(f.store, "1.0.2")
  const first = await f.start({initialDigest: a.digest})
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([a.digest])
  await first.host.handover(b.digest)
  expect(await (await f.request("/version")).text()).toBe("1.0.1")
  expect((await f.request("/")).status).toBe(500)
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([b.digest, a.digest])
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  expect(selection.target).toBe(a.digest)
  expect(selection.target).not.toBe(c.digest)
  await verifyInstalledReleaseSelection(f.root, selection)
  await f.assertState()
  await first.destroy()
  const downgraded = await f.start({selection})
  expect(downgraded.host.active.runtime.identity.version).toBe("1.0.0")
  expect((await f.request("/")).status).toBe(200)
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([a.digest, b.digest])
  await f.assertState()
  await downgraded.destroy()
  const restarted = await f.start({initialDigest: b.digest})
  expect(restarted.host.active.runtime.identity.version).toBe("1.0.0")
  expect((await f.store.readActive())?.digest).toBe(a.digest)
  await f.assertState()
}, 15_000)

test("устаревшее решение отклоняется до запуска candidate и не меняет durable выбор", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1")
  const runtime = await f.start({initialDigest: a.digest})
  await runtime.host.handover(b.digest)
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  await f.store.confirmActive(b.digest, "fixture-state:changed", selection.expected)
  const before = await f.events()
  await expect(verifyInstalledReleaseSelection(f.root, selection)).rejects.toThrow("changed")
  expect(await f.events()).toBe(before)
  expect(await (await f.request("/version")).text()).toBe("1.0.1")
  await runtime.destroy()
  const stopped = await f.events()
  const activation = await f.store.readActivation()
  await expect(f.start({selection})).rejects.toThrow("changed")
  expect(await f.events()).toBe(stopped)
  expect(await f.store.readActivation()).toEqual(activation)
}, 15_000)

for (const line of ["fixture-state:2", null]) {
  test(`линия ${line ?? "legacy missing"} запрещает downgrade до остановки живого B`, async () => {
    const f = await fixture()
    const a = await candidate(f.store, "1.0.0", line)
    const b = await candidate(f.store, "1.0.1")
    const runtime = await f.start({initialDigest: a.digest})
    await runtime.host.handover(b.digest)
    const before = await f.events()
    const activation = await f.store.readActivation()
    await expect(prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})).rejects.toThrow("compatibility")
    await expect(prepareInstalledReleaseSelection(f.root, {kind: "activate", target: a.digest})).rejects.toThrow("compatibility")
    expect(await f.events()).toBe(before)
    expect(runtime.host.active.runtime.identity.version).toBe("1.0.1")
    expect(await (await f.request("/version")).text()).toBe("1.0.1")
    expect(await f.store.readActivation()).toEqual(activation)
    await f.assertState()
  }, 15_000)
}

test("явная activate меняет выбор через stop/start, а initialDigest больше не переназначает active", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1")
  const first = await f.start({initialDigest: a.digest})
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "activate", target: b.digest})
  expect(selection.target).toBe(b.digest)
  expect((await f.store.readActivation())?.digest).toBe(a.digest)
  expect(await (await f.request("/version")).text()).toBe("1.0.0")
  await first.destroy()
  const activated = await f.start({selection})
  expect(activated.host.active.runtime.identity.version).toBe("1.0.1")
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([b.digest, a.digest])
  await f.assertState()
  await expect(prepareInstalledReleaseSelection(f.root, {kind: "activate", target: b.digest})).rejects.toThrow("already selected")
  await activated.destroy()
  const restarted = await f.start({initialDigest: a.digest})
  expect(restarted.host.active.runtime.identity.version).toBe("1.0.1")
  expect((await f.store.readActive())?.digest).toBe(b.digest)
  await f.assertState()
}, 15_000)

test("CLI stale selection не останавливает C, сменивший active после preflight", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1")
  const c = await candidate(f.store, "1.0.2")
  const runtime = await f.start({initialDigest: a.digest})
  await runtime.host.handover(b.digest)
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  let changed = false
  const fetcher = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.method === "POST" && !changed) {
      changed = true
      await runtime.host.handover(c.digest)
    }
    return fetch(input, init)
  }, {preconnect: fetch.preconnect}) as typeof fetch
  await expect(applyLiveReleaseSelection(selection, new URL(f.origin), {fetcher, timeoutMs: 1000})).rejects.toThrow("изменился")
  expect(changed).toBeTrue()
  expect(runtime.host.active.runtime.identity.version).toBe("1.0.2")
  expect(runtime.host.active.runtime.process.exitCode).toBeNull()
  expect(await (await f.request("/version")).text()).toBe("1.0.2")
  const events = (await f.events()).trim().split("\n").map(line => JSON.parse(line))
  expect(events.filter(event => event.version === "1.0.2").map(event => event.event)).toEqual(["bind", "admit"])
  await f.assertState()
}, 15_000)

test("CLI live selection использует parent receipt, а timeout не разрешает cold fallback", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1")
  await f.start({initialDigest: a.digest})
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "activate", target: b.digest})
  let operationId = ""
  expect(await applyLiveReleaseSelection(selection, new URL(f.origin), {pollMs: 10, timeoutMs: 5000, onOperation: id => {operationId = id}})).toBeTrue()
  expect((await f.store.readActivation())?.operation).toMatchObject({id: operationId, target: b.digest, state: "complete"})
  const next = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  let posts = 0
  const snapshot = await (await f.request("/release/manage")).json()
  const identity = await installedReleaseStoreIdentity(f.root)
  const fetcher = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.method === "POST") {posts++; throw new Error("response lost after possible acceptance")}
    return Response.json(snapshot, {headers: {"X-Cosmos-Store-Identity": identity}})
  }, {preconnect: fetch.preconnect}) as typeof fetch
  await expect(applyLiveReleaseSelection(next, new URL(f.origin), {fetcher, timeoutMs: 0})).rejects.toThrow("unknown outcome")
  expect(posts).toBe(1)
  expect(await (await f.request("/version")).text()).toBe("1.0.1")
}, 15_000)

test("CLI не изменяет другой store с тем же digest/revision, включая смену owner между GET и POST", async () => {
  const left = await fixture()
  const right = await fixture()
  const a = await candidate(left.store, "1.0.0")
  const b = await candidate(left.store, "1.0.1")
  expect((await candidate(right.store, "1.0.0")).digest).toBe(a.digest)
  expect((await candidate(right.store, "1.0.1")).digest).toBe(b.digest)
  await left.start({initialDigest: a.digest})
  await right.start({initialDigest: a.digest})
  const selection = await prepareInstalledReleaseSelection(left.root, {kind: "activate", target: b.digest})
  const rightBefore = await right.store.readActivation()
  await expect(applyLiveReleaseSelection(selection, new URL(right.origin))).rejects.toThrow("does not match")
  const fetcher = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (init?.method === "POST") return fetch(new URL("/release/manage", right.origin), {...init,
      headers: {...Object.fromEntries(new Headers(init.headers)), origin: right.origin}})
    return fetch(input, init)
  }, {preconnect: fetch.preconnect}) as typeof fetch
  await expect(applyLiveReleaseSelection(selection, new URL(left.origin), {fetcher})).rejects.toThrow("хранилищем")
  expect(await right.store.readActivation()).toEqual(rightBefore)
  expect((await left.store.readActivation())?.digest).toBe(a.digest)
  expect(await (await right.request("/version")).text()).toBe("1.0.0")
}, 15_000)

test("installer допускает первый новый compatibility baseline, но неизвестную старую версию требует проверить", async () => {
  const f = await fixture()
  const legacy = await candidate(f.store, "1.0.0", null)
  const first = await candidate(f.store, "1.0.1")
  const older = await candidate(f.store, "0.9.0", null)
  const runtime = await f.start({initialDigest: legacy.digest})
  expect((await prepareInstalledReleaseSelection(f.root, {kind: "activate", target: first.digest})).target).toBe(first.digest)
  await expect(prepareInstalledReleaseSelection(f.root, {kind: "activate", target: older.digest})).rejects.toThrow("compatibility")
  expect(runtime.host.active.runtime.identity.version).toBe("1.0.0")
}, 15_000)

test("отказ admission после bind не добавляет B в successful и требует явного возврата A", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1", "fixture-state:1", false, true)
  const first = await f.start({initialDigest: a.digest})
  const selection = await prepareInstalledReleaseSelection(f.root, {kind: "activate", target: b.digest})
  await first.destroy()
  const before = (await f.events()).trim().split("\n").map(line => JSON.parse(line))
  await expect(f.start({selection})).rejects.toThrow("fixture admission failed")
  const failed = (await f.events()).trim().split("\n").map(line => JSON.parse(line))
  expect(failed.filter(event => event.version === "1.0.1").map(event => event.event)).toContain("bind")
  expect(failed.filter(event => event.version === "1.0.1").map(event => event.event)).toContain("admit-failed")
  expect(failed.filter(event => event.version === "1.0.1").map(event => event.event)).not.toContain("admit")
  expect(failed.filter(event => event.version === "1.0.0")).toEqual(before.filter(event => event.version === "1.0.0"))
  expect((await f.store.readActivation())?.digest).toBe(b.digest)
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([a.digest])
  for (const [file, bytes] of f.original) expect(await Bun.file(join(f.stateRoot, file)).text()).toBe(bytes)
  const downgrade = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  expect(downgrade.target).toBe(a.digest)
  const recovered = await f.start({selection: downgrade})
  expect(recovered.host.active.runtime.identity.version).toBe("1.0.0")
  expect((await f.store.readActivation())?.successful.map(item => item.digest)).toEqual([a.digest])
  await f.assertState()
}, 15_000)

test("Settings HTTP принимает один intent, startup выполняет handover и новый Core читает тот же receipt", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1", "fixture-state:1", true)
  await f.start({initialDigest: a.digest})
  const read = async () => await (await f.request("/release/manage")).json() as ReleaseManagementSnapshot
  const post = (body: unknown, origin = f.origin) => f.request("/release/manage", {method: "POST",
    headers: {origin, "content-type": "application/json"}, body: JSON.stringify(body)})
  const before = await read()
  expect(before.active?.digest).toBe(a.digest)
  expect(before.candidates.find(item => item.digest === b.digest)?.activate.allowed).toBeTrue()
  expect(JSON.stringify(before)).not.toContain(f.root)
  const input = {operationId: "settings-activate-b", kind: "activate", target: b.digest,
    expected: {digest: a.digest, revision: before.revision}}
  expect((await post(input, "https://foreign.test")).status).toBe(403)
  const accepted = await post(input)
  expect(accepted.status).toBe(202)
  expect(await accepted.json()).toEqual({operationId: input.operationId, state: "accepted"})
  await until(async () => (await f.store.readActivation())?.operation?.state === "complete")
  const current = await read()
  expect(current.active?.digest).toBe(b.digest)
  expect(current.operation).toEqual({id: input.operationId, kind: "activate", target: b.digest, state: "complete"})
  expect(current.candidates.find(item => item.digest === a.digest)?.previousSuccessful).toBeTrue()
  expect((await f.request("/")).status).toBe(500)
  const events = await f.events()
  expect((await post(input)).status).toBe(202)
  expect((await post({...input, kind: "downgrade", target: a.digest})).status).toBe(409)
  await Bun.sleep(25)
  expect(await f.events()).toBe(events)
  const rollback = {operationId: "settings-downgrade-a", kind: "downgrade", target: a.digest,
    expected: {digest: b.digest, revision: current.revision}}
  expect((await post(rollback)).status).toBe(202)
  await until(async () => {const op = (await f.store.readActivation())?.operation; return op?.id === rollback.operationId && op.state === "complete"})
  expect((await read()).active?.digest).toBe(a.digest)
  expect((await f.request("/")).status).toBe(200)
  await f.assertState()
}, 15_000)

test("Settings не обходит compatibility через activate и не отправляет intent при stale CAS", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1", "fixture-state:2")
  const c = await candidate(f.store, "1.0.2")
  await f.start({initialDigest: a.digest})
  const snapshot = await (await f.request("/release/manage")).json() as ReleaseManagementSnapshot
  const target = snapshot.candidates.find(item => item.digest === b.digest)!
  expect(target.activate.allowed).toBeFalse()
  expect(target.activate.reason).toContain("несовместимы")
  const before = await f.events()
  const response = await f.request("/release/manage", {method: "POST", headers: {origin: f.origin, "content-type": "application/json"},
    body: JSON.stringify({operationId: "incompatible-ui", kind: "activate", target: b.digest,
      expected: {digest: a.digest, revision: snapshot.revision}})})
  expect(response.status).toBe(409)
  const stale = await f.request("/release/manage", {method: "POST", headers: {origin: f.origin, "content-type": "application/json"},
    body: JSON.stringify({operationId: "stale-ui", kind: "activate", target: c.digest,
      expected: {digest: a.digest, revision: snapshot.revision + 1}})})
  expect(stale.status).toBe(409)
  expect((await f.store.readActivation())?.operation).toBeUndefined()
  expect(await f.events()).toBe(before)
  expect((await f.request("/")).status).toBe(200)
}, 15_000)

test("startup сохраняет failed receipt operator intent после отказа admission без автоматического fallback", async () => {
  const f = await fixture()
  const a = await candidate(f.store, "1.0.0")
  const b = await candidate(f.store, "1.0.1", "fixture-state:1", false, true)
  const runtime = await f.start({initialDigest: a.digest})
  const before = await f.store.readActivation()
  const response = await f.request("/release/manage", {method: "POST", headers: {origin: f.origin, "content-type": "application/json"},
    body: JSON.stringify({operationId: "failed-admission-ui", kind: "activate", target: b.digest,
      expected: {digest: a.digest, revision: before!.revision}})})
  expect(response.status).toBe(202)
  await until(async () => (await f.store.readActivation())?.operation?.state === "failed")
  const failed = await f.store.readActivation()
  expect(failed?.operation).toMatchObject({id: "failed-admission-ui", target: b.digest, state: "failed"})
  expect(failed?.successful.map(item => item.digest)).toEqual([a.digest])
  expect(failed?.digest).toBe(b.digest)
  expect((await runtime.host.finished).reason).toBe("failed")
  await runtime.destroy()
  const plan = await prepareInstalledReleaseSelection(f.root, {kind: "downgrade"})
  await f.start({selection: plan})
  const snapshot = await (await f.request("/release/manage")).json() as ReleaseManagementSnapshot
  expect(snapshot.operation?.id).toBe("failed-admission-ui")
  expect(snapshot.operation?.state).toBe("failed")
  expect(snapshot.active?.digest).toBe(a.digest)
  await f.assertState()
}, 15_000)

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error("Installed operation receipt timed out")
    await Bun.sleep(10)
  }
}
