/** Staged IPC не расширяет прежнюю строгую форму ready и не принимает sender paths. */
import {describe, expect, test} from "bun:test"
import {
  currentServerProcessLaunch,
  readServerProcessCommand,
  readServerProcessFailure,
  readServerProcessHandoverRequest,
  readServerProcessHandoverResult,
  readServerProcessLifecycle,
  readServerProcessReady,
  serverProcessCommandMessage,
  serverProcessFailure,
  serverProcessLaunchEnvironment,
  serverProcessLifecycle,
  serverProcessReady,
} from "../../../shared/package/process"

const identity = {name: "@cosmos/release", env: "server" as const, version: "1.0.0", sha256: "a".repeat(64), size: 42}

describe.each(["quiesce", "resume", "unbind", "bind", "admit"] as const)("%s", type => {
  test("Команда связана с точной incarnation и переходом", () => {
    const command = serverProcessCommandMessage(type, identity, "transition")
    expect(readServerProcessCommand(command)).toEqual(command)
    expect(readServerProcessCommand({...command, executable: "/outside/server.js"})).toBeNull()
    expect(readServerProcessCommand({...command, transitionId: ""})).toBeNull()
  })
})

test("Legacy ready и staged ready являются разными envelopes", () => {
  const legacy = serverProcessReady(identity)
  const staged = serverProcessLifecycle("ready", identity, "transition")
  expect(readServerProcessReady(legacy)).toEqual(legacy)
  expect(readServerProcessReady(staged)).toBeNull()
  expect(readServerProcessLifecycle(legacy)).toBeNull()
  expect(readServerProcessLifecycle(staged)).toEqual(staged)
})

test("Ошибка операции сохраняет correlation", () => {
  const failure = serverProcessFailure("quiesce", identity, "transition", "accepted operation failed")
  expect(readServerProcessFailure(failure)).toEqual(failure)
  expect(readServerProcessFailure({...failure, operation: "restart"})).toBeNull()
})

test("Цель handover является установленным именем, sender path запрещён", () => {
  const request = {type: "handover-request", requestId: "request", target: "composition"} as const
  expect(readServerProcessHandoverRequest(request)).toEqual(request)
  expect(readServerProcessHandoverRequest({...request, executable: "/outside/server.js"})).toBeNull()
  expect(readServerProcessHandoverResult({type: "handover-result", requestId: "request", success: true}))
    .toEqual({type: "handover-result", requestId: "request", success: true})
  expect(readServerProcessHandoverResult({type: "handover-result", requestId: "request", success: false})).toBeNull()
})

test("Launch сохраняет legacy отсутствие режима и валидирует staged declaration", () => {
  expect(currentServerProcessLaunch({})).toBeNull()
  const launch = {mode: "prepared" as const, transitionId: "transition"}
  expect(currentServerProcessLaunch(serverProcessLaunchEnvironment(launch))).toEqual(launch)
  expect(() => currentServerProcessLaunch({COSMOS_PROCESS_MODE: "prepared"})).toThrow("launch is invalid")
})
