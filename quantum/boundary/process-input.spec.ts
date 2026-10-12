import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {Force} from "shared/transport/force"
import {backupBoundaryDatabase} from "./backup"
import {createForceTestFixture} from "../dark/force/fixture"
import {prepareMatrixBirthFixture} from "../matrix/tests/shared/fixtures"
import {weak$} from "../matrix/weak"
import type {Particle} from "shared/protocol/force/particle"
import {open} from "./sqlite"
import {buildMatrixRuntime} from "../matrix/birth"

const ROOT = "input/root"
const CHILD = "input/child"
const message = (part: Omit<Particle, "ts">) => ({parts: [{ts: 1, ...part}] as [Particle]})

for (const scenario of [
  {label: "integer change", before: 0, next: 1, changed: true},
  {label: "same-F32 exact canonical change", before: 0.1, next: 0.10000000150000002, changed: true},
  {label: "no-op canonical write", before: 0.1, next: 0.1, changed: false},
  {label: "newer failed execution", before: 0, next: 1, changed: true, failure: true},
  {label: "VACUUM backup with tied timestamps and cold replacement", before: 0, next: 1, changed: true, backup: true},
]) test(`${scenario.label} fences only changed shared child before replacement Photon`, async () => {
  const directory = "backup" in scenario ? await mkdtemp(join(tmpdir(), "process-input-backup-")) : undefined
  let filename = directory ? join(directory, "source.sqlite") : ":memory:"
  let boundary = await open(filename)
  let backups = 0
  const backupAndReopen = async () => {
    // Force the existing seconds-resolution timestamps to tie. Selection must
    // survive the supported VACUUM INTO backup, not merely the open handle.
    await boundary.projection.sql`UPDATE boundary_process_execution SET created_at = ${42}`
    expect(Number((await boundary.projection.sql<Array<{count: number}>>`SELECT COUNT(DISTINCT created_at) AS count FROM boundary_process_execution`)[0]!.count)).toBe(1)
    const target = join(directory!, `backup-${++backups}.sqlite`)
    expect(backupBoundaryDatabase({source: filename, target}).bytes).toBeGreaterThan(0)
    await boundary.close()
    filename = target
    boundary = await open(filename)
  }
  try {
    const declarations: Array<[string, Record<string, unknown>]> = [
      ["wimp", {src: ROOT, name: "Root"}],
      ["field", {wimp: ROOT, id: 1, key: "requestId", type: "number", default: scenario.before}],
      ["state", {wimp: ROOT, id: 1, name: "ready", position: 0}],
      ["process", {wimp: ROOT, id: 1, key: "ready", type: "action", env: ["server"], action: {src: "./root.ts", read: [1]}, success: {src: "() => {}", write: [1]}}],
      ["matter", {wimp: ROOT, id: 1, kind: "wimp", src: CHILD, parent: null, edgeSlot: "root", position: 0, fieldsBinding: {data: "requestId", expr: "{requestId: _[0]}"}}],
      ["matter", {wimp: ROOT, id: 2, kind: "wimp", src: CHILD, parent: null, edgeSlot: "root", position: 1}],
      ["wimp", {src: CHILD, name: "Child"}],
      ["field", {wimp: CHILD, id: 1, key: "requestId", type: "number", default: scenario.before}],
      ["field", {wimp: CHILD, id: 2, key: "result", type: "number", default: 0}],
      ["state", {wimp: CHILD, id: 1, name: "ready", position: 0}],
      ["process", {wimp: CHILD, id: 1, key: "ready", type: "action", env: ["server"], action: {src: "./child.ts", read: [1]}, success: {src: "() => {}", write: [2]}}],
    ]
    for (const [path, value] of declarations) await boundary.materialize(message({part: "inflaton", op: "add", path, by: "dark", value}))
    const initial = await boundary.initialState()
    const root = initial.atoms.find(atom => atom.wimp === ROOT)!
    const field = (src: string, key: string) => Number(initial.declarations.find(row => row.src === src && row.section === "fields" && row.value.key === key)!.value.id)
    const processId = (src: string) => Number(initial.declarations.find(row => row.src === src && row.section === "processes")!.value.id)
    const request = field(ROOT, "requestId")
    const sharedValue = root.values.find(value => value.field === request)!.valueId
    const child = initial.atoms.find(atom => atom.wimp === CHILD && atom.values.some(value => value.field === field(CHILD, "requestId") && value.valueId === sharedValue))!
    const unrelated = initial.atoms.find(atom => atom.wimp === CHILD && atom.id !== child.id)!
    const result = field(CHILD, "result")
    expect(root.values.find(value => value.field === request)!.valueId).toBe(child.values.find(value => value.field === field(CHILD, "requestId"))!.valueId)
    const begin = async (atom: number, execution: string) => {
      await boundary.materialize(message({part: "photon", op: "test", path: atom, by: "matrix", from: execution, value: "ready"}))
      await boundary.materialize(message({part: "z", op: "copy", path: atom, by: "matrix", from: "energy-input", value: {processExecutionId: execution, fields: {}}}))
    }
    await begin(root.id, "root-execution")
    if (directory) {
      await begin(child.id, "child-previous-completed")
      expect(await boundary.materialize(message({part: "w+", op: "replace", path: child.id, by: "energy", from: "energy-input", value: {
        processExecutionId: "child-previous-completed", processId: processId(CHILD), fields: {},
      }}))).not.toBeNull()
    }
    await begin(child.id, "child-old")
    await begin(unrelated.id, "unrelated-current")
    const committed = await boundary.materialize(message({part: "w+", op: "replace", path: root.id, by: "energy", from: "energy-input", value: {
      processExecutionId: "root-execution", processId: processId(ROOT), fields: {[request]: scenario.next},
    }}))
    expect(committed!.messages.some(({parts}) => parts[0].part === "gluon" && parts[0].path === child.id && parts[0].from === "root-execution")).toBeTrue()
    // No Matrix delivery/new Photon yet: the old result must already be stale
    // at the canonical owner, rather than racing a later registration.
    if (directory) await backupAndReopen()
    const pending = (await boundary.initialState()).pendingProcessExecutions.map(item => item.executionId)
    expect(pending).toContain("unrelated-current")
    const status = (await boundary.projection.sql<Array<{status: string}>>`SELECT status FROM boundary_process_execution WHERE execution_id = ${"child-old"}`)[0]!.status
    expect(status).toBe(scenario.changed ? "superseded" : "pending")
    // A cold Matrix at this exact canonical cut still needs a fresh execution.
    expect(buildMatrixRuntime(await boundary.initialState()).runtime.restartProcessAtomIds).toContain(child.id)
    const late = await boundary.materialize(message({part: "w+", op: "replace", path: child.id, by: "energy", from: "energy-input", value: {
      processExecutionId: "child-old", processId: processId(CHILD), fields: {[result]: 999},
    }}))
    if (scenario.changed) expect(late).toBeNull()
    else expect(late).not.toBeNull()
    expect((await boundary.initialState()).atoms.find(atom => atom.id === child.id)!.values.find(value => value.field === result)!.value).toBe(scenario.changed ? 0 : 999)
    let replacement = "child-new"
    if (directory) {
      const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
      Bun.env.METAFOR_WEAK_BACKEND = "cpu"
      const fixture = createForceTestFixture()
      try {
        await prepareMatrixBirthFixture(await boundary.initialState())
        const connected = fixture.nextClient("matrix")
        const runtime = await import(`../matrix/matrix.ts?after-input-backup=${crypto.randomUUID()}`)
        await runtime.startMatrixForce(() => new Force("matrix"))
        const client = await connected
        const fresh = (await fixture.waitForMessage(entry => entry.client === client && entry.message.parts[0].part === "photon" && entry.message.parts[0].path === child.id)).message.parts[0]
        replacement = String(fresh.from)
        expect(replacement).not.toBe("child-old")
        expect(fresh).toMatchObject({part: "photon", op: "test", value: "ready"})
      } finally {
        fixture.close()
        weak$.dispose()
        if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
        else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
      }
    }
    await begin(child.id, replacement)
    const replacementHints = (await boundary.initialState()).pendingProcessExecutions.filter(item => item.atom === child.id)
    expect(replacementHints.map(item => item.executionId)).toEqual([replacement])
    expect(await boundary.materialize(message({part: "failure" in scenario ? "w-" : "w+", op: "replace", path: child.id, by: "energy", from: "energy-input", value: {
      processExecutionId: replacement, processId: processId(CHILD), fields: "failure" in scenario ? {} : {[result]: 1},
    }}))).not.toBeNull()
    if (directory) await backupAndReopen()
    expect(buildMatrixRuntime(await boundary.initialState()).runtime.restartProcessAtomIds).not.toContain(child.id)
    expect((await boundary.initialState()).pendingProcessExecutions.some(item => item.executionId === "child-old")).toBeFalse()
  } finally {
    await boundary.close()
    if (directory) await rm(directory, {recursive: true, force: true})
  }
})

test("superseded execution from another State does not resurrect on cold read", async () => {
  const boundary = await open(":memory:")
  try {
    for (const [path, value] of [
      ["wimp", {src: ROOT, name: "State change"}],
      ["state", {wimp: ROOT, id: 1, name: "ready", position: 0}],
      ["state", {wimp: ROOT, id: 2, name: "done", position: 1}],
      ["process", {wimp: ROOT, id: 1, key: "ready", type: "action", action: {src: "./ready.ts", read: []}}],
    ] as const) await boundary.materialize(message({part: "inflaton", op: "add", path, by: "dark", value}))
    const atomId = (await boundary.initialState()).atoms[0]!.id
    await boundary.materialize(message({part: "photon", op: "test", path: atomId, by: "matrix", from: "state-old", value: "ready"}))
    await boundary.materialize(message({part: "photon", op: "replace", path: atomId, by: "matrix", from: "state-changed", value: "done"}))
    expect((await boundary.projection.sql<Array<{status: string}>>`SELECT status FROM boundary_process_execution WHERE execution_id = ${"state-old"}`)[0]!.status).toBe("superseded")
    expect((await boundary.initialState()).pendingProcessExecutions).toEqual([])
    expect(buildMatrixRuntime(await boundary.initialState()).runtime.restartProcessAtomIds).toEqual([])
  } finally { await boundary.close() }
})
