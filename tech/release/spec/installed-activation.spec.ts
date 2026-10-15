import {expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createInstalledReleaseStore, validatePublishedReleaseGraph} from "../installed"

async function temporary(work: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "installed-activation-")))
  try { await work(root) } finally { await rm(root, {recursive: true, force: true}) }
}

async function prepare(store: ReturnType<typeof createInstalledReleaseStore>, version: string) {
  const body = Buffer.from(`export const version = '${version}'`)
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@fixture/activation", version, dependencies: {}, environments: [{
      env: "server", publicArtifacts: {}, outputs: [{
        artifact: ".", kind: "entry-point", type: "text/javascript", load: "eager",
        sha256: createHash("sha256").update(body).digest("hex"), size: body.length,
      }],
    }],
  }]})
  return await store.prepare(graph, {read: async () => body})
}

test("legacy выбор читается без выдуманной истории и преобразуется после подтверждения", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const legacy = {schemaVersion: 1, digest: a.digest}
  await Bun.write(join(root, "active.json"), JSON.stringify(legacy))
  expect(await store.readActivation()).toEqual({schemaVersion: 2, digest: a.digest, revision: 0, successful: []})
  expect((await store.readActive())?.digest).toBe(a.digest)
  await store.commitActive(a.digest, {digest: a.digest, revision: 0})
  expect(await Bun.file(join(root, "active.json")).json()).toEqual(legacy)
  await store.confirmActive(a.digest, null, {digest: a.digest, revision: 0})
  expect(await createInstalledReleaseStore({root}).readActivation()).toEqual({
    schemaVersion: 2, digest: a.digest, revision: 1, successful: [{digest: a.digest, compatibility: null}],
  })
}))

test("подготовка и commit не означают успешный admission", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  expect(await store.readActivation()).toBeNull()
  await store.commitActive(a.digest, {digest: null, revision: 0})
  expect(await createInstalledReleaseStore({root}).readActivation()).toEqual({
    schemaVersion: 2, digest: a.digest, revision: 1, successful: [],
  })
}))

test("operator receipt сохраняется через commit и admission в той же atomic записи", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const b = await prepare(store, "1.0.1")
  await store.commitActive(a.digest)
  let current = await store.confirmActive(a.digest, "state:1", (await store.readActivation())!)
  const operation = {id: "operator-test", kind: "activate" as const, target: b.digest,
    expected: {digest: a.digest, revision: current.revision}, state: "running" as const}
  current = await store.recordOperation(operation, current)
  await store.commitActive(b.digest, current)
  current = await store.confirmActive(b.digest, "state:1", (await store.readActivation())!)
  expect(current.operation).toEqual(operation)
  await expect(store.recordOperation({...operation, state: "complete"}, operation.expected)).rejects.toThrow("changed")
  current = await store.recordOperation({...operation, state: "complete"}, current)
  expect((await createInstalledReleaseStore({root}).readActivation())?.operation).toEqual({...operation, state: "complete"})
  await expect(store.recordOperation({...operation, state: "complete", error: "not a failed operation"}, current)).rejects.toThrow("Invalid")
  expect((await store.readActivation())?.successful[0]?.digest).toBe(b.digest)
}))

test("A → B сохраняет только подтверждённые выпуски в порядке последних admission", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const b = await prepare(store, "1.0.1")
  await store.commitActive(a.digest)
  await store.confirmActive(a.digest, "state:1", {digest: a.digest, revision: 1})
  await store.commitActive(b.digest, {digest: a.digest, revision: 2})
  expect((await store.readActivation())?.successful).toEqual([{digest: a.digest, compatibility: "state:1"}])
  await store.confirmActive(b.digest, "state:1", {digest: b.digest, revision: 3})
  expect(await createInstalledReleaseStore({root}).readActivation()).toEqual({
    schemaVersion: 2, digest: b.digest, revision: 4,
    successful: [{digest: b.digest, compatibility: "state:1"}, {digest: a.digest, compatibility: "state:1"}],
  })
  await store.commitActive(a.digest, {digest: b.digest, revision: 4})
  await store.confirmActive(a.digest, "state:2", {digest: a.digest, revision: 5})
  expect((await store.readActivation())?.successful).toEqual([
    {digest: a.digest, compatibility: "state:2"}, {digest: b.digest, compatibility: "state:1"},
  ])
}))

test("устаревший CAS и подтверждение чужого digest не меняют запись", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const b = await prepare(store, "1.0.1")
  await store.commitActive(a.digest)
  const before = await Bun.file(join(root, "active.json")).text()
  await expect(store.commitActive(b.digest, {digest: null, revision: 0})).rejects.toThrow("changed")
  await expect(store.confirmActive(a.digest, "state:1", {digest: a.digest, revision: 0})).rejects.toThrow("changed")
  await expect(store.confirmActive(b.digest, "state:1", {digest: a.digest, revision: 1})).rejects.toThrow("changed")
  expect(await Bun.file(join(root, "active.json")).text()).toBe(before)
}))

test("CAS отклоняет ABA даже когда digest снова совпадает", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const b = await prepare(store, "1.0.1")
  await store.commitActive(a.digest)
  const stale = {digest: a.digest, revision: 1}
  await store.commitActive(b.digest, stale)
  await store.commitActive(a.digest, {digest: b.digest, revision: 2})
  const before = await store.readActivation()
  await expect(store.commitActive(b.digest, stale)).rejects.toThrow("changed")
  await expect(store.confirmActive(a.digest, "state:1", stale)).rejects.toThrow("changed")
  expect(await store.readActivation()).toEqual(before)
  expect(before?.revision).toBe(3)
}))

test("два store с одним ожиданием не могут оба заменить active", async () => temporary(async root => {
  const first = createInstalledReleaseStore({root})
  const second = createInstalledReleaseStore({root})
  const a = await prepare(first, "1.0.0")
  const b = await prepare(first, "1.0.1")
  const results = await Promise.allSettled([
    first.commitActive(a.digest, {digest: null, revision: 0}),
    second.commitActive(b.digest, {digest: null, revision: 0}),
  ])
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1)
  expect((await first.readActivation())?.revision).toBe(1)
}))

test("повторное подтверждение того же digest и compatibility не переписывает active", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  await store.commitActive(a.digest)
  const confirmed = await store.confirmActive(a.digest, "state:1", {digest: a.digest, revision: 1})
  const before = await Bun.file(join(root, "active.json")).text()
  await store.commitActive(a.digest, {digest: a.digest, revision: 2})
  expect(await store.confirmActive(a.digest, "state:1", {digest: a.digest, revision: 2})).toEqual(confirmed)
  expect(await Bun.file(join(root, "active.json")).text()).toBe(before)
}))

test("невалидный compatibility не подтверждает выбранный выпуск", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  await store.commitActive(a.digest)
  for (const compatibility of ["", " invalid", "state\n1", "x".repeat(181)]) {
    await expect(store.confirmActive(a.digest, compatibility, {digest: a.digest, revision: 1})).rejects.toThrow("compatibility")
  }
  expect((await store.readActivation())?.successful).toEqual([])
  expect((await store.readActivation())?.revision).toBe(1)
}))

test("повреждённая activation metadata отклоняется при чтении и перед commit", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const valid = {schemaVersion: 2, digest: a.digest, revision: 1, successful: []}
  const success = {digest: a.digest, compatibility: "state:1"}
  const invalid = [
    null, [], {...valid, schemaVersion: 3}, {...valid, digest: "../escape"},
    {...valid, revision: 0}, {...valid, revision: -1}, {...valid, revision: 1.5},
    {...valid, revision: Number.MAX_SAFE_INTEGER + 1}, {...valid, extra: true},
    {...valid, successful: {}}, {...valid, successful: [null]},
    {...valid, successful: [{...success, digest: "invalid"}]},
    {...valid, successful: [{...success, compatibility: ""}]},
    {...valid, successful: [{...success, compatibility: 1}]},
    {...valid, successful: [{...success, extra: true}]},
    {...valid, successful: [success, success]},
    {...valid, successful: Array.from({length: 33}, (_, index) => ({digest: index.toString(16).padStart(64, "0"), compatibility: null}))},
    {schemaVersion: 1, digest: a.digest, successful: [success]},
  ]
  for (const metadata of invalid) {
    const bytes = JSON.stringify(metadata)
    await Bun.write(join(root, "active.json"), bytes)
    await expect(store.readActivation()).rejects.toThrow("Invalid active")
    await expect(store.commitActive(a.digest)).rejects.toThrow("Invalid active")
    expect(await Bun.file(join(root, "active.json")).text()).toBe(bytes)
  }
}))

test("история ограничена 32 последними успешными digest", async () => temporary(async root => {
  const store = createInstalledReleaseStore({root})
  const a = await prepare(store, "1.0.0")
  const history = Array.from({length: 32}, (_, index) => ({
    digest: index.toString(16).padStart(64, "0"), compatibility: "state:1",
  }))
  await Bun.write(join(root, "active.json"), JSON.stringify({schemaVersion: 2, digest: a.digest, revision: 64, successful: history}))
  await store.confirmActive(a.digest, "state:1", {digest: a.digest, revision: 64})
  expect((await store.readActivation())?.successful).toEqual([{digest: a.digest, compatibility: "state:1"}, ...history.slice(0, 31)])
  expect((await store.readActivation())?.revision).toBe(65)
}))
