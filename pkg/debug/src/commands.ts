import {appendFileSync, existsSync, readFileSync, statSync} from "node:fs"
import {serializeError} from "./errors.ts"
import {ensureParentDir} from "./fs.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {InspectorClient} from "./inspector-client.ts"
import type {EventLogger} from "./logger.ts"
import type {SnapshotStore} from "./snapshot.ts"
import {sleep} from "./time.ts"
import type {JsonObject} from "./types.ts"

export type CommandContext = {
  client: InspectorClient
  snapshots: SnapshotStore
  logger: EventLogger
  stdin?: ReadableStream<Uint8Array>
  stdout?: {
    write(chunk: string): unknown
  }
  responsePath?: string
}

export async function readStdinCommands(context: CommandContext): Promise<void> {
  const stdin = context.stdin ?? Bun.stdin.stream()
  const reader = stdin.getReader()
  let buffer = ""
  let sequence = 0
  const textDecoder = new TextDecoder()

  const handleLine = async (line: string) => {
    sequence += 1
    await handleCommandLine(context, sequence, line)
  }

  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      const chunk = value
      buffer += textDecoder.decode(chunk, {stream: true})

      let newlineIndex = buffer.indexOf("\n")
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) await handleLine(line)
        newlineIndex = buffer.indexOf("\n")
      }
    }

    buffer += textDecoder.decode()
    const tail = buffer.trim()
    if (tail.length > 0) await handleLine(tail)
    context.logger.event("stdin.closed", {})
  } catch (error) {
    context.logger.event("stdin.failed", {error: serializeError(error)})
  } finally {
    reader.releaseLock()
  }
}

export async function readFileCommands(context: CommandContext, commandPath: string): Promise<void> {
  ensureParentDir(commandPath)
  context.logger.event("command_file.started", {commandPath, responsePath: context.responsePath})

  let buffer = ""
  let sequence = 0
  let offset = existsSync(commandPath) ? statSync(commandPath).size : 0

  while (true) {
    try {
      if (!existsSync(commandPath)) {
        await sleep(250)
        continue
      }

      const stat = statSync(commandPath)
      if (stat.size < offset) {
        offset = 0
        buffer = ""
        context.logger.event("command_file.truncated", {commandPath})
      }

      if (stat.size > offset) {
        const file = readFileSync(commandPath)
        const chunk = file.subarray(offset).toString("utf8")
        offset = file.byteLength
        buffer += chunk

        let newlineIndex = buffer.indexOf("\n")
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line.length > 0) {
            sequence += 1
            await handleCommandLine(context, sequence, line)
          }
          newlineIndex = buffer.indexOf("\n")
        }
      }
    } catch (error) {
      context.logger.event("command_file.failed", {commandPath, error: serializeError(error)})
    }

    await sleep(250)
  }
}

async function handleCommandLine(context: CommandContext, seq: number, line: string): Promise<void> {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch (error) {
    writeCommandResponse(context, {
      seq,
      ok: false,
      error: serializeError(error),
    })
    return
  }

  const command = asObject(parsed)
  const cmd = asString(command?.["cmd"])
  const requestId = command?.["id"]

  context.logger.event("agent.command.received", {seq, cmd})

  try {
    if (command === undefined || cmd === undefined) {
      throw new Error("command must be a JSON object with string field cmd")
    }

    const result = await executeCommand(context, command, cmd)
    const response: JsonObject = {
      seq,
      ok: true,
      cmd,
      result,
    }
    if (requestId !== undefined) response["id"] = requestId
    writeCommandResponse(context, response)
  } catch (error) {
    const response: JsonObject = {
      seq,
      ok: false,
      error: serializeError(error),
    }
    if (cmd !== undefined) response["cmd"] = cmd
    if (requestId !== undefined) response["id"] = requestId
    writeCommandResponse(context, response)
  }
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
  if (!context.snapshots.paused) throw new Error("process is not paused")

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
    objectGroup: "agent-eval",
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
  if (!context.snapshots.paused) throw new Error("process is not paused")

  const kind = asString(command["kind"])
  const methodByKind: Record<string, string> = {
    // Bun's own debug adapter maps DAP "next" / UI Step Over to
    // WebKit Inspector's stepNext. stepOver resumes through async code here.
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

function writeCommandResponse(context: CommandContext, response: JsonObject): void {
  const stdout = context.stdout ?? process.stdout
  const line = `${JSON.stringify(response)}\n`
  stdout.write(line)

  if (context.responsePath !== undefined) {
    try {
      ensureParentDir(context.responsePath)
      appendFileSync(context.responsePath, line)
    } catch (error) {
      context.logger.event("agent.command.response_file_failed", {error: serializeError(error)})
    }
  }
}
