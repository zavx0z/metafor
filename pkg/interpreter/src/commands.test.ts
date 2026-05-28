import {describe, expect, test} from "bun:test"
import {executeCommand, type CommandContext} from "./commands.ts"

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  const requests: Array<{method: string; params?: Record<string, unknown>}> = []
  return {
    client: {
      requests,
      request(method: string, params?: Record<string, unknown>): Promise<unknown> {
        requests.push(params === undefined ? {method} : {method, params})
        return Promise.resolve({ok: true})
      },
    } as never,
    snapshots: {
      paused: true,
      callFrames: [{callFrameId: "frame-1"}],
      dump: undefined,
      markRunning(): void {},
    } as never,
    ...overrides,
  }
}

describe("executeCommand", () => {
  test("evaluates on the selected call frame", async () => {
    const ctx = context()

    await executeCommand(ctx, {frame: 0, expr: "value"}, "eval")

    expect((ctx.client as never as {requests: unknown[]}).requests).toEqual([{
      method: "Debugger.evaluateOnCallFrame",
      params: {
        callFrameId: "frame-1",
        expression: "value",
        objectGroup: "interpreter-eval",
        includeCommandLineAPI: true,
        returnByValue: false,
        generatePreview: true,
      },
    }])
  })

  test("rejects eval while module is not paused", async () => {
    const ctx = context({
      snapshots: {
        paused: false,
        callFrames: [],
        dump: undefined,
        markRunning(): void {},
      } as never,
    })

    await expect(executeCommand(ctx, {expr: "value"}, "eval")).rejects.toThrow("module is not paused")
  })

  test("marks snapshots running after resume", async () => {
    let markedRunning = false
    const ctx = context({
      snapshots: {
        paused: true,
        callFrames: [],
        dump: undefined,
        markRunning(): void {
          markedRunning = true
        },
      } as never,
    })

    await executeCommand(ctx, {}, "resume")

    expect(markedRunning).toBe(true)
  })
})
