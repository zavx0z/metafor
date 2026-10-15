import {afterEach, expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph, type PublishedReleaseOutput} from "@metafor/tech-release/installed"
import {createReleaseManagement} from "../server/installed/management"
import type {ReleaseManagementRequest} from "../shared/management"

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
  expect(finished.operation).toMatchObject({id: input.operationId, state: terminal})
  expect(finished.active?.digest).toBe(terminal === "complete" ? b.digest : a.digest)
  expect(finished.candidates.some(item => item.activate.allowed)).toBe(true)
  expect(requests).toBe(1)
  expect(deferred).toHaveLength(1)

  // После подтверждённого завершения новый owner receipt не воскрешает local pending.
  await store.recordOperation({...operation, id: "later-operation", state: "failed"}, (await store.readActivation())!)
  expect((await management.read()).operation).toMatchObject({id: "later-operation", state: "failed"})
})
