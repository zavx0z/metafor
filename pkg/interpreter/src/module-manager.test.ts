import {afterEach, describe, expect, test} from "bun:test"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {EventLogger} from "./logger.ts"
import {InterpreterModuleManager, type InterpreterModuleEvent} from "./module.ts"
import type {InterpreterConfig} from "./config.ts"

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, {recursive: true, force: true})
})

describe("InterpreterModuleManager", () => {
  test("removes a module and emits a removed event", async () => {
    const root = mkdtempSync(join(tmpdir(), "metafor-module-manager-"))
    tempRoots.push(root)
    const manager = new InterpreterModuleManager(testConfig(root), new QuietEventLogger())
    const events: InterpreterModuleEvent[] = []
    manager.onEvent((event) => events.push(event))

    const module = manager.create({id: "worker-debug-smoke", label: "worker debug"})
    expect(manager.get(module.id)).toBe(module)
    expect(manager.snapshots().map((snapshot) => snapshot.id)).toEqual(["worker-debug-smoke"])

    const removed = await manager.remove(module.id)
    expect(removed).toBe(module)
    expect(manager.get(module.id)).toBeUndefined()
    expect(manager.snapshots()).toEqual([])
    expect(events.map((event) => event.type)).toEqual(["created", "removed"])
  })
})

function testConfig(root: string): InterpreterConfig {
  return {
    protocolUrl: "ws://127.0.0.1:6499/",
    dumpPath: join(root, "state.json"),
    eventLogPath: join(root, "events.log"),
    consoleLogPath: join(root, "console.log"),
    requestTimeoutMs: 1,
    initializedFallbackMs: 0,
    reconnectDelayMs: 1,
    httpEnabled: false,
    httpHost: "127.0.0.1",
    httpPort: 6500,
  }
}

class QuietEventLogger extends EventLogger {
  constructor() {
    super("/tmp/metafor-module-manager-test/events.log")
  }

  override status(_message: string): void {}

  override event(_event: string): void {}
}
