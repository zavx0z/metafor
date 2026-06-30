import {describe, expect, test} from "bun:test"
import {
  bridgeUrlWithToken,
  createEnergyFailureForce,
  createEnergyServerStatus,
  createEnergySuccessForce,
  readEnergyBridgeIncomingMessage,
} from "./server-bridge.ts"
import type {EnergyEnv} from "./energy.t.ts"

const env: EnergyEnv = {kind: "server", id: "energy-test", labels: ["test"]}

describe("energy server bridge helpers", () => {
  test("adds bridge token to URL", () => {
    expect(bridgeUrlWithToken("ws://127.0.0.1:3004/energy/ws", null)).toBe("ws://127.0.0.1:3004/energy/ws")
    expect(bridgeUrlWithToken("ws://127.0.0.1:3004/energy/ws", "secret")).toBe("ws://127.0.0.1:3004/energy/ws?token=secret")
  })

  test("parses incoming bridge messages", () => {
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "force", parts: [{part: "photon", op: "replace", path: 17, value: "ready"}]}))).toEqual({
      type: "force",
      parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
    })
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "process-task", version: 1, task: {actorId: 17, state: "ready", processId: 42, fields: {"2": "x"}}}))).toEqual({
      type: "process-task",
      version: 1,
      task: {actorId: 17, state: "ready", processId: 42, fields: {"2": "x"}},
    })
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "claim-accepted", actorId: 17, processId: 42, token: "run-1"}))).toEqual({type: "claim-accepted", actorId: 17, processId: 42, token: "run-1"})
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "claim-rejected", actorId: 17, processId: 42, reason: "busy"}))).toEqual({type: "claim-rejected", actorId: 17, processId: 42, reason: "busy"})
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "error", error: "bridge failed"}))).toEqual({type: "error", error: "bridge failed"})
  })

  test("rejects malformed messages", () => {
    expect(readEnergyBridgeIncomingMessage("not-json")).toBeNull()
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "process-task", version: 1, task: {actorId: 17, processId: 42}}))).toBeNull()
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "claim-accepted", actorId: "17", processId: 42}))).toBeNull()
    expect(readEnergyBridgeIncomingMessage(JSON.stringify({type: "error", error: null}))).toBeNull()
  })

  test("creates status payload", () => {
    expect(createEnergyServerStatus({
      pid: 1,
      startedAt: "2026-06-30T00:00:00.000Z",
      host: "127.0.0.1",
      port: 3006,
      bridgeUrl: "ws://127.0.0.1:3004/energy/ws",
      socketState: "connected",
      env,
      activeTasks: 0,
      completedTasks: 1,
      failedTasks: 0,
      lastTaskAt: null,
      lastResultAt: "2026-06-30T00:00:01.000Z",
      lastError: null,
    })).toMatchObject({ok: true, runtime: "energy", connected: true, completedTasks: 1})
  })

  test("creates process result Force without legacy paths", () => {
    const success = createEnergySuccessForce({ok: true, actorId: 17, processId: 42, token: "run-1", fields: {"2": "done"}})
    const failure = createEnergyFailureForce({ok: false, actorId: 17, processId: 42, error: "failed"})

    expect(success).toEqual({parts: [{part: "w+", op: "replace", path: 17, processId: 42, token: "run-1", value: {fields: {"2": "done"}}}]})
    expect(failure).toEqual({parts: [{part: "w-", op: "replace", path: 17, processId: 42, value: {error: "failed"}}]})
    expect(JSON.stringify([success, failure])).not.toContain(["/fi", "eld/"].join(""))
    expect(JSON.stringify([success, failure])).not.toContain(["wimp", "Id"].join(""))
  })
})
