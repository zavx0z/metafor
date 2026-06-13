import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {ProtocolClient} from "./protocol-client.ts"
import type {SnapshotStore} from "./snapshot.ts"
import type {JsonObject} from "./types.ts"

export type CommandContext = {
  client: ProtocolClient
  snapshots: SnapshotStore
  setBreakpointsActive?: (active: boolean) => Promise<unknown> | unknown
}

export async function executeCommand(context: CommandContext, command: JsonObject, cmd: string): Promise<unknown> {
  switch (cmd) {
    case "eval":
      return await evaluateCommand(context, command)
    case "props":
      return await propsCommand(context, command)
    case "step":
      return await stepCommand(context, command)
    case "pause":
      return await context.client.request("Debugger.pause")
    case "resume":
      return await resumeCommand(context)
    case "breakpointsActive":
    case "setBreakpointsActive":
      return await setBreakpointsActiveCommand(context, command)
    case "muteBreakpoints":
      return await setBreakpointsActive(context, false)
    case "unmuteBreakpoints":
      return await setBreakpointsActive(context, true)
    case "frames":
      return {
        paused: context.snapshots.paused,
        frames: context.snapshots.callFrames,
        dump: context.snapshots.dump,
      }
    default:
      throw new Error(`unknown command: ${cmd}`)
  }
}

async function evaluateCommand(context: CommandContext, command: JsonObject): Promise<unknown> {
  if (!context.snapshots.paused) throw new Error("module is not paused")

  const frameIndex = asNumber(command["frame"]) ?? 0
  const expression = asString(command["expr"])

  if (!Number.isInteger(frameIndex) || frameIndex < 0) {
    throw new Error("eval frame must be a non-negative integer")
  }
  if (expression === undefined) {
    throw new Error("eval expr must be a string")
  }

  const frame = context.snapshots.callFrames[frameIndex]
  if (frame === undefined) throw new Error(`call frame ${frameIndex} is not available`)
  if (frame.callFrameId === undefined) throw new Error(`call frame ${frameIndex} has no callFrameId`)

  return await context.client.request("Debugger.evaluateOnCallFrame", {
    callFrameId: frame.callFrameId,
    expression,
    objectGroup: "interpreter-eval",
    includeCommandLineAPI: true,
    returnByValue: false,
    generatePreview: true,
  })
}

async function propsCommand(context: CommandContext, command: JsonObject): Promise<unknown> {
  const objectId = asString(command["objectId"])
  if (objectId === undefined) throw new Error("props objectId must be a string")

  const ownProperties = asBoolean(command["ownProperties"]) ?? true

  return await context.client.request("Runtime.getProperties", {
    objectId,
    ownProperties,
    generatePreview: true,
  })
}

async function stepCommand(context: CommandContext, command: JsonObject): Promise<unknown> {
  if (!context.snapshots.paused) throw new Error("module is not paused")

  const kind = asString(command["kind"])
  if (kind === "over") {
    const target = context.snapshots.sourceStepOverTarget()
    if (target !== null) {
      try {
        const result = await context.client.request("Debugger.continueToLocation", {
          location: target.location,
          targetCallFrames: "current",
        })
        context.snapshots.markRunning()
        return {
          mode: "source-over",
          target,
          result: asObject(result) ?? result,
        }
      } catch {
        // Bun versions that do not support continueToLocation should still step.
      }
    }
  }

  const methodByKind: Record<string, string> = {
    // Bun's protocol adapter maps DAP "next" / UI Step Over to
    // WebKit stepNext. stepOver resumes through async code here.
    over: "Debugger.stepNext",
    into: "Debugger.stepInto",
    out: "Debugger.stepOut",
  }

  if (kind === undefined || methodByKind[kind] === undefined) {
    throw new Error('step kind must be "over", "into", or "out"')
  }

  const result = await context.client.request(methodByKind[kind])
  context.snapshots.markRunning()
  return result
}

async function resumeCommand(context: CommandContext): Promise<unknown> {
  const result = await context.client.request("Debugger.resume")
  context.snapshots.markRunning()
  return result
}

async function setBreakpointsActiveCommand(context: CommandContext, command: JsonObject): Promise<unknown> {
  const active = asBoolean(command["active"])
  if (active === undefined) throw new Error("breakpoints active must be a boolean")
  return await setBreakpointsActive(context, active)
}

async function setBreakpointsActive(context: CommandContext, active: boolean): Promise<unknown> {
  if (context.setBreakpointsActive !== undefined) return await context.setBreakpointsActive(active)
  const result = await context.client.request("Debugger.setBreakpointsActive", {active})
  return {active, result}
}
