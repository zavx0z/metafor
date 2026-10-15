import {expect, spyOn, test} from "bun:test"
import {collectReadinessCleanup, createReadinessTrace, readinessCauses, withinReadinessDeadline} from "../release/server/readiness"
import {OracleRpcPeer} from "../../shared/transport/oracle/peer"

test("readiness diagnostics retain elapsed completed phases and the exact pending await on interruption", async () => {
  const debug = spyOn(console, "debug").mockImplementation(() => {})
  const error = spyOn(console, "error").mockImplementation(() => {})
  let clock = 0
  const trace = createReadinessTrace("bind", () => clock)
  const pending = Promise.withResolvers<void>()
  try {
    await trace.step("native-oracle", () => {clock = 3})
    const waiting = trace.step("quantum-start", () => pending.promise)
    clock = 13
    trace.interrupted({state: "running"})
    trace.interrupted()
    const original = new Error("health RPC unanswered")
    pending.reject(original)
    await expect(waiting).rejects.toBe(original)
    clock = 20
    const combined = new AggregateError([original, new Error("cleanup failed")], "bind failed", {cause: original})
    trace.failed(combined)
    expect(error.mock.calls).toHaveLength(2)
    expect(error.mock.calls[0]).toEqual(["[@cosmos/release:readiness]", "readiness interrupted", {
      owner: "bind", phase: "quantum-start", elapsedMs: 13, phaseElapsedMs: 10,
      completed: [{phase: "native-oracle", elapsedMs: 3}], observation: {state: "running"},
    }])
    expect(error.mock.calls[1]?.[2]).toMatchObject({phase: "quantum-start", elapsedMs: 20, phaseElapsedMs: 17,
      causes: ["bind failed", "health RPC unanswered", "cleanup failed"]})
    const completed = createReadinessTrace("quantum", () => clock)
    await completed.step("root-state", () => {clock = 25})
    completed.complete()
    completed.interrupted()
    expect(error.mock.calls).toHaveLength(2)
    expect(debug.mock.calls).toEqual([["[@cosmos/release:readiness]", "readiness complete", {
      owner: "quantum", elapsedMs: 5, completed: [{phase: "root-state", elapsedMs: 5}],
    }]])
  } finally {debug.mockRestore(); error.mockRestore()}
})

test("owned bind cleanup retains original failure and continues after a cleanup rejection", async () => {
  const original = new Error("original bind failure"), cleanup = new Error("cleanup failure")
  let calls = 0
  const result = await collectReadinessCleanup(original, [() => {calls++; throw cleanup}, () => {calls++}])
  expect(calls).toBe(2)
  expect(result).toBeInstanceOf(AggregateError)
  expect((result as AggregateError).errors).toEqual([original, cleanup])
  expect((result as Error).cause).toBe(original)
  expect(readinessCauses(result)).toEqual(["Readiness failed and owned cleanup failed", "original bind failure", "cleanup failure"])
  expect(await collectReadinessCleanup(original, [() => {}])).toBe(original)
})

test("existing health deadline bounds an unanswered Oracle RPC and owner close settles its pending call", async () => {
  let sent = 0, detached = 0
  const peer = new OracleRpcPeer({identity: "dark", methods: [], async send() {sent++}, subscribe() {return () => {detached++}}, async close() {}})
  const rpc = peer.call("matrix", "health", {})
  const result = rpc.catch(error => error)
  try {
    await expect(withinReadinessDeadline(() => rpc, Date.now() + 20, "matrix-initialized")).rejects.toThrow("matrix-initialized readiness timed out")
    expect(sent).toBe(1)
  } finally {peer.close(new Error("owned health cleanup"))}
  expect(await result).toMatchObject({message: "owned health cleanup"})
  expect(detached).toBe(1)
  let invoked = false
  await expect(withinReadinessDeadline(async () => {invoked = true}, Date.now() - 1, "causal-health")).rejects.toThrow("causal-health readiness timed out")
  expect(invoked).toBeFalse()
})
