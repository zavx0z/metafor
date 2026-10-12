import {expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {open} from "../../boundary/sqlite"
import {BoundaryWimpSqlite} from "../../boundary/wimp/sqlite/sqlite"
import {readBoundaryGraphProjection} from "../../boundary/graph/runtime"
import {normalizeMetaTemplate} from "../../dark/graph/declaration"
import {canonicalizeGraph} from "../../dark/graph/checkpoint"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"

const root = parseMetaAddress("@fixture/lifecycle")!
const lifecycle = {started: {field: "request", value: "recover"}, stopping: {field: "request", value: "stop"}}
const fields = [{key: "request", type: "string" as const}]

test("WIMP migrates legacy metadata and preserves canonical lifecycle on reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-wimp-lifecycle-"))
  const filename = join(directory, "world.sqlite")
  const legacy = new SQL(`sqlite://${filename}`)
  await legacy.unsafe("CREATE TABLE wimp (src TEXT PRIMARY KEY, name TEXT, desc TEXT, view_css TEXT)")
  await legacy`INSERT INTO wimp (src, name) VALUES (${"@fixture/legacy"}, ${"Legacy"})`
  await legacy.close()
  let boundary = await open(filename)
  try {
    const old = (await boundary.initialProjection()).entries.find(entry => entry.path === "wimp")
    expect(old?.value).not.toHaveProperty("lifecycle")
    await boundary.materialize({parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: root, name: "Lifecycle", lifecycle}}]})
    await boundary.materialize({parts: [{part: "inflaton", op: "add", path: "field", ts: 2, value: {wimp: root, id: 1, ...fields[0]}}]})
    const stored = (await boundary.initialProjection()).entries.find(entry => entry.path === "wimp" && (entry.value as {src?: string}).src === root)
    expect(stored?.value).toMatchObject({src: root, lifecycle})
    await expect(boundary.materialize({parts: [{part: "inflaton", op: "remove", path: "field", ts: 3, value: {wimp: root, id: 1}}]})).rejects.toThrow("lifecycle Field")
    await expect(boundary.materialize({parts: [{part: "inflaton", op: "replace", path: "field", ts: 4, value: {wimp: root, id: 1, key: "request", type: "enum", required: false}}]})).rejects.toThrow("ordinary Field")
    await boundary.close()
    boundary = await open(filename)
    expect((await boundary.initialProjection()).entries.find(entry => entry.path === "wimp" && (entry.value as {src?: string}).src === root)?.value).toEqual(stored?.value)
    expect((await boundary.initialState()).declarations.find(entry => entry.src === root && entry.section === "fields")?.value.type).toBe("string")
  } finally {await boundary.close(); await rm(directory, {recursive: true, force: true})}
})

test("prepared WIMP lifecycle roundtrips through public Graph and changes checkpoint digest", async () => {
  const boundary = await open(":memory:")
  try {
    const database = await BoundaryWimpSqlite.open(boundary.projection.sql)
    const wimp = await database.create(root, {name: "Lifecycle", lifecycle, fields})
    expect(await wimp.lifecycle.get()).toEqual(lifecycle)
    const dsl = {name: "Lifecycle materialized", lifecycle, fields, superposition: [], processes: [], mass: [], matter: []}
    await boundary.materialize({parts: [{part: "inflaton", op: "replace", path: "wimp", ts: 1, value: {src: root, name: "Lifecycle materialized", lifecycle}}]})
    const current = await readBoundaryGraphProjection(boundary, {})
    const graph: Graph = {schema: GRAPH_SCHEMA, root: current.root, runtime: current.runtime, template: {[root]: normalizeMetaTemplate(dsl, root)}}
    const first = canonicalizeGraph(graph)
    expect(first.value.template[current.root]?.lifecycle).toEqual(lifecycle)
    const changed = structuredClone(graph)
    changed.template[current.root]!.lifecycle!.started!.value = "different"
    expect(canonicalizeGraph(changed).sha256).not.toBe(first.sha256)
    await expect(wimp.lifecycle.set({started: {field: "missing", value: true}})).rejects.toThrow("ordinary Field")
  } finally {await boundary.close()}
})
