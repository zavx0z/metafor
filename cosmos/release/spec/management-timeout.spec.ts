import {afterEach, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, rename, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph, type PublishedReleaseOutput} from "@metafor/tech-release/installed"
import {createReleaseManagement} from "../server/installed/management"
import {RELEASE_MANAGEMENT_ACTIVATION_VIEW, RELEASE_MANAGEMENT_VIEW_HEADER, type ReleaseManagementRequest} from "../shared/management"
import {installedReleaseStoreIdentity, prepareInstalledReleaseSelection} from "../../selection"
import {applyLiveReleaseSelection} from "../../../.agents/skills/metafor-dev/scripts/release-selection"

const roots: string[] = []
const line = "management-fixture:1"

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))
})

async function candidate(store: ReturnType<typeof createInstalledReleaseStore>, version: string) {
  const bytes = new Map<string, Uint8Array>()
  const output = (artifact: PublishedReleaseOutput["artifact"], text: string, kind: PublishedReleaseOutput["kind"]): PublishedReleaseOutput => {
    const body = Buffer.from(text)
    const sha256 = createHash("sha256").update(body).digest("hex")
    bytes.set(sha256, body)
    return {artifact, kind, type: kind === "asset" ? "application/json" : "text/javascript", sha256, size: body.length,
      ...(artifact === "." ? {load: "eager" as const} : {})}
  }
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@cosmos/release", version, dependencies: {}, environments: [{
      env: "server", publicArtifacts: {"./persisted-state.json": ".json"}, outputs: [
        output(".", `export const version = ${JSON.stringify(version)}`, "entry-point"),
        output("./persisted-state.json", JSON.stringify({version: 1, compatibilityLine: line}), "asset"),
      ],
    }],
  }]})
  return await store.prepare(graph, {async read(identity) {
    const body = bytes.get(identity.sha256)
    if (!body) throw new Error("Fixture artifact missing")
    return body
  }})
}

test.each(["complete", "failed"] as const)("timeout IPC остаётся pending до позднего owner receipt %s", async terminal => {
  const root = await mkdtemp(join(tmpdir(), "cosmos-management-timeout-"))
  roots.push(root)
  const store = createInstalledReleaseStore({root})
  const a = await candidate(store, "1.0.0")
  const b = await candidate(store, "1.0.1")
  await store.commitActive(a.digest)
  await store.confirmActive(a.digest, line, (await store.readActivation())!)
  const deferred: (() => Promise<void>)[] = []
  const waiter = Promise.withResolvers<void>()
  let requests = 0
  const management = createReleaseManagement({storeRoot: root, defer: work => {deferred.push(work)}, async request() {
    requests++
    await waiter.promise
  }})
  const input: ReleaseManagementRequest = {operationId: "late-startup", kind: "activate", target: b.digest,
    expected: {digest: a.digest, revision: (await store.readActivation())!.revision}}
  const host = {requestIP: () => ({address: "127.0.0.1"})}
  const post = (request: ReleaseManagementRequest) => management.fetch(new Request("http://127.0.0.1:4555/release/manage", {
    method: "POST", headers: {origin: "http://127.0.0.1:4555", "content-type": "application/json"}, body: JSON.stringify(request),
  }), host)

  expect((await post(input)).status).toBe(202)
  expect(deferred).toHaveLength(1)
  expect(requests).toBe(0)
  const waiting = deferred[0]!()
  waiter.reject(new Error("Server handover request timed out"))
  await waiting
  expect(requests).toBe(1)
  const unknown = await management.read()
  expect((await management.readStatus()).operation).toEqual(unknown.operation)
  expect(unknown.operation).toMatchObject({id: input.operationId, target: b.digest, state: "unknown"})
  expect(unknown.candidates.every(item => !item.activate.allowed && !item.downgrade.allowed)).toBe(true)
  expect((await post(input)).status).toBe(202)
  expect((await post({...input, operationId: "second-intent"})).status).toBe(409)
  expect(deferred).toHaveLength(1)

  // Чужой terminal receipt не подтверждает исход уже переданного намерения.
  await store.recordOperation({id: "another-operation", kind: input.kind, target: b.digest,
    expected: input.expected, state: "failed", error: "another selection failed"}, (await store.readActivation())!)
  expect((await management.read()).operation).toMatchObject({id: input.operationId, state: "unknown"})
  expect((await post({...input, operationId: "second-intent"})).status).toBe(409)

  const operation = {id: input.operationId, kind: input.kind, target: b.digest, expected: input.expected}
  await store.recordOperation({...operation, state: "running"}, (await store.readActivation())!)
  const running = await management.read()
  expect(running.operation).toMatchObject({id: input.operationId, state: "running"})
  expect(running.candidates.every(item => !item.activate.allowed && !item.downgrade.allowed)).toBe(true)
  expect((await post({...input, operationId: "second-intent"})).status).toBe(409)
  if (terminal === "complete") {
    await store.commitActive(b.digest, (await store.readActivation())!)
    await store.confirmActive(b.digest, line, (await store.readActivation())!)
  }
  await store.recordOperation({...operation, state: terminal,
    ...(terminal === "failed" ? {error: "Startup admission failed"} : {})}, (await store.readActivation())!)
  const finished = await management.read()
  expect((await management.readStatus()).operation).toEqual(finished.operation)
  expect(finished.operation).toMatchObject({id: input.operationId, state: terminal})
  expect(finished.active?.digest).toBe(terminal === "complete" ? b.digest : a.digest)
  expect(finished.candidates.some(item => item.activate.allowed)).toBe(true)
  expect(requests).toBe(1)
  expect(deferred).toHaveLength(1)

  // После подтверждённого завершения новый owner receipt не воскрешает local pending.
  await store.recordOperation({...operation, id: "later-operation", state: "failed"}, (await store.readActivation())!)
  expect((await management.read()).operation).toMatchObject({id: "later-operation", state: "failed"})
})

test("тонкая activation-проекция не читает candidate inventory и сохраняет owner guard", async () => {
  const root = await mkdtemp(join(tmpdir(), "cosmos-management-status-"))
  roots.push(root)
  const store = createInstalledReleaseStore({root}), a = await candidate(store, "1.0.0")
  await store.commitActive(a.digest)
  await store.confirmActive(a.digest, line, (await store.readActivation())!)
  const management = createReleaseManagement({storeRoot: root, defer() {}, async request() {throw new Error("read must not mutate")}})
  await rename(join(root, "candidates"), join(root, "fixture-candidates"))
  await writeFile(join(root, "candidates"), "inventory deliberately unavailable")
  const url = "http://127.0.0.1:4555/release/manage", host = {requestIP: () => ({address: "127.0.0.1"})}
  const response = await management.fetch(new Request(url, {headers: {[RELEASE_MANAGEMENT_VIEW_HEADER]: RELEASE_MANAGEMENT_ACTIVATION_VIEW}}), host)
  expect(response.status).toBe(200)
  expect(response.headers.get("X-Cosmos-Store-Identity")).toBe(await installedReleaseStoreIdentity(root))
  expect(await response.json()).toEqual({schemaVersion: 1, active: {digest: a.digest}, revision: 2, operation: null})
  await expect(management.read()).rejects.toThrow()
  expect((await management.fetch(new Request(url, {headers: {[RELEASE_MANAGEMENT_VIEW_HEADER]: "unknown"}}), host)).status).toBe(400)
  expect((await management.fetch(new Request(url, {headers: {[RELEASE_MANAGEMENT_VIEW_HEADER]: RELEASE_MANAGEMENT_ACTIVATION_VIEW, origin: "https://foreign.example"}}), host)).status).toBe(403)
})

test.each(["thin", "legacy-full"] as const)("CLI pending читает один activation record, HTTP owner proof только до и после intent (%s)", async mode => {
  const fixture = await cliReadbackFixture(mode)
  expect(await fixture.run()).toBeTrue()
  expect(fixture.observed()).toEqual({posts: 1, gets: 2, pendingGets: 0})
})

test.each(["store", "release", "unavailable"] as const)("terminal receipt без совпадающего live %s proof остаётся unknown без второго POST", async fault => {
  const fixture = await cliReadbackFixture("thin", fault)
  await expect(fixture.run()).rejects.toThrow("unknown outcome")
  expect(fixture.observed()).toEqual({posts: 1, gets: 2, pendingGets: 0})
})

async function cliReadbackFixture(mode: "thin" | "legacy-full", fault?: "store" | "release" | "unavailable") {
  const root = await mkdtemp(join(tmpdir(), "cosmos-cli-readback-"))
  roots.push(root)
  const store = createInstalledReleaseStore({root})
  const a = await candidate(store, "1.0.0"), b = await candidate(store, "1.0.1")
  await store.commitActive(a.digest)
  await store.confirmActive(a.digest, line, (await store.readActivation())!)
  const selection = await prepareInstalledReleaseSelection(root, {kind: "activate", target: b.digest})
  let terminal = false, posts = 0, gets = 0, pendingGets = 0
  let work: Promise<void> | undefined
  const management = createReleaseManagement({storeRoot: root,
    defer(callback) {work = callback()},
    async request(selected, id) {
      const operation = {id, kind: selected.kind, target: selected.target, expected: selected.expected}
      await store.recordOperation({...operation, state: "running"}, (await store.readActivation())!)
      await Bun.sleep(80)
      await store.commitActive(b.digest, (await store.readActivation())!)
      await store.confirmActive(b.digest, line, (await store.readActivation())!)
      terminal = true
      await store.recordOperation({...operation, state: "complete"}, (await store.readActivation())!)
    },
  })
  const fetcher = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const headers = new Headers(init?.headers)
    if (init?.method === "POST") posts++
    else {
      gets++
      expect(headers.get(RELEASE_MANAGEMENT_VIEW_HEADER)).toBe(RELEASE_MANAGEMENT_ACTIVATION_VIEW)
      if (gets > 1 && !terminal) {pendingGets++; throw new Error("Unexpected candidate inventory poll")}
      if (terminal && fault === "unavailable") throw new Error("readback unavailable")
      if (mode === "legacy-full") headers.delete(RELEASE_MANAGEMENT_VIEW_HEADER)
    }
    const response = await management.fetch(new Request(String(input), {...init, headers}), {requestIP: () => ({address: "127.0.0.1"})})
    response.headers.set("X-Cosmos-Release", terminal && fault !== "release" ? b.digest : a.digest)
    if (terminal && fault === "store") response.headers.set("X-Cosmos-Store-Identity", "another-store")
    return response
  }, {preconnect: fetch.preconnect}) as typeof fetch
  return {
    async run() {
      try {return await applyLiveReleaseSelection(selection, new URL("http://127.0.0.1:4555"), {fetcher, pollMs: 5, timeoutMs: 1000})}
      finally {await work}
    },
    observed: () => ({posts, gets, pendingGets}),
  }
}
