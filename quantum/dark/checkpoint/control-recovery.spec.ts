import {expect, test} from "bun:test"
import {mkdtempSync, readFileSync, rmSync, writeFileSync, statSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {DarkForceHistory} from "../force/history"
import {ForceLifecycle} from "../force/lifecycle"
import {particleDestinations} from "../force/route"
import {DarkCheckpointControl, readCheckpointControlState} from "./control"
import {recoverCheckpointControlTail} from "./control-recovery"
import {FORCE_CHECKPOINT_PREPARE_METHOD, FORCE_CHECKPOINT_WAIT_APPLIED_METHOD} from "shared/transport/force/checkpoint"
import type {SourcedForceMessage} from "shared/protocol/force/message"

const participants = ["dark", "boundary", "matrix", "energy"] as const
const peer = {expose() {}, async call(_target: string, method: string, value: unknown) {
  if (method === FORCE_CHECKPOINT_PREPARE_METHOD) return {ok: true}
  if (method === FORCE_CHECKPOINT_WAIT_APPLIED_METHOD) return value
  throw new Error(`Unexpected recovery RPC ${method}`)
}}
const fixture = (tailOrigin: "matrix" | "dark" | "agent" = "matrix") => {
  const root = mkdtempSync(join(tmpdir(), "checkpoint-tail-owner-")), filename = join(root, "control", "state.json"), historyDirectory = join(root, "history")
  const history = new DarkForceHistory(historyDirectory, {cutId: "single-tail"})
  const control = new DarkCheckpointControl(filename, history.status(), peer as never, participants)
  const prefix = history.accept({part: "graviton", op: "add", path: "state", by: "boundary", ts: 1, value: {id: 1}})
  const receipts = control.recordAccepted(prefix.sequence, particleDestinations({parts: [prefix.particle]}, "boundary", participants))
  control.acceptedFrom("boundary")
  const tail = history.accept({part: "z", op: "copy", path: 1, by: tailOrigin, ts: 2, value: {processExecutionId: "fixture-execution", fields: {allowed: true}}})
  const input = {filename, historyDirectory, participants, operationId: "owner-tail-1", expectedCutId: "single-tail", expectedControlSequence: 1, expectedHistorySequence: 2}
  return {root, control, history, receipts, tail, input}
}

test("native owner appends one missing receipt tail and normal Force recovery replays original identity without new history", async () => {
  const f = fixture()
  try {
    await f.control.waitApplied([f.receipts[0]!])
    const original = readFileSync(f.input.filename), before = readCheckpointControlState(f.input.filename, participants)
    const historyCatalog = readFileSync(join(f.input.historyDirectory, "catalog.json"))
    expect(() => new DarkCheckpointControl(f.input.filename, f.history.status(), peer as never, participants)).toThrow("does not match")
    const proof = recoverCheckpointControlTail(f.input)
    expect(proof.deliveries.map(row => row.domain)).toEqual(["dark", "boundary", "energy"])
    expect(proof.outgoing.find(row => row.domain === "matrix")).toMatchObject({before: 0, after: 1})
    expect(readFileSync(f.input.filename)).toEqual(original)
    expect(readFileSync(join(f.input.historyDirectory, "catalog.json"))).toEqual(historyCatalog)
    expect(() => recoverCheckpointControlTail({...f.input, expectedControlSha256: "a".repeat(64)}, "apply")).toThrow("fingerprint")
    const committed = recoverCheckpointControlTail({...f.input, expectedControlSha256: proof.predecessorSha256}, "apply")
    expect(readFileSync(committed.backupPath)).toEqual(original)
    expect(statSync(committed.backupPath).mode & 0o777).toBe(0o600)
    const after = readCheckpointControlState(f.input.filename, participants)
    expect(after.barrier.acceptanceSequence).toBe(2)
    for (const row of after.barrier.domains) {
      expect(row.appliedOrdinal).toBe(before.barrier.domains.find(old => old.domain === row.domain)!.appliedOrdinal)
      expect(row.appliedAcceptanceSequence).toBe(before.barrier.domains.find(old => old.domain === row.domain)!.appliedAcceptanceSequence)
    }
    expect(recoverCheckpointControlTail({...f.input, expectedControlSha256: proof.predecessorSha256}, "apply").replayed).toBe(true)
    const restored = new DarkCheckpointControl(f.input.filename, f.history.status(), peer as never, participants)
    const readonlyHistory = new DarkForceHistory(f.input.historyDirectory, undefined, {readOnly: true})
    const deliveries: Array<{domain: string; message: SourcedForceMessage}> = []
    const lifecycle = new ForceLifecycle(readonlyHistory, restored, participants)
    lifecycle.start(Object.fromEntries(participants.map(domain => [domain, {domain, send(message: SourcedForceMessage) {deliveries.push({domain, message})}}])) as never)
    for (const domain of participants) lifecycle.channelReady(domain)
    expect(await lifecycle.waitUntilStarted()).toMatchObject({state: "running", ok: true})
    expect(deliveries.filter(row => row.message.parts[0].ts === 2).map(row => row.domain)).toEqual(["dark", "boundary", "energy"])
    for (const row of deliveries.filter(row => row.message.parts[0].ts === 2)) expect(row.message.parts[0]).toEqual(f.tail.particle)
    expect(restored.pendingDeliveries()).toEqual([])
    expect(new DarkForceHistory(f.input.historyDirectory, undefined, {readOnly: true}).status().sequence).toBe(2)
    expect(readFileSync(join(f.input.historyDirectory, "catalog.json"))).toEqual(historyCatalog)
  } finally {rmSync(f.root, {recursive: true, force: true})}
})

test.each(["dark", "agent"] as const)("native recovery refuses %s origin instead of inferring an outgoing counter", source => {
  const f = fixture(source)
  try {
    const before = readFileSync(f.input.filename)
    expect(() => recoverCheckpointControlTail(f.input)).toThrow("outbox source")
    expect(readFileSync(f.input.filename)).toEqual(before)
  } finally {rmSync(f.root, {recursive: true, force: true})}
})

test("wrong cut, non-single gap, altered predecessor and missing history refuse without control writes", () => {
  const f = fixture()
  try {
    const before = readFileSync(f.input.filename)
    for (const change of [{expectedCutId: "foreign"}, {expectedControlSequence: 0}, {expectedHistorySequence: 1}]) expect(() => recoverCheckpointControlTail({...f.input, ...change})).toThrow()
    expect(readFileSync(f.input.filename)).toEqual(before)
    const catalog = join(f.input.historyDirectory, "catalog.json")
    writeFileSync(catalog, "broken cache")
    const readonly = new DarkForceHistory(f.input.historyDirectory, undefined, {readOnly: true})
    expect(readonly.status().sequence).toBe(2)
    expect(readFileSync(catalog, "utf8")).toBe("broken cache")
    expect(() => readonly.accept(f.tail.particle)).toThrow("Read-only")
    expect(() => new DarkForceHistory(join(f.root, "missing"), undefined, {readOnly: true})).toThrow("existing manifest")
  } finally {rmSync(f.root, {recursive: true, force: true})}
})
