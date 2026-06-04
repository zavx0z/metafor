import {atomicWriteJson} from "./fs.ts"
import {asCallFrames, asObject, asPropertyDescriptors, asString, asStringArray} from "./guards.ts"
import type {ProtocolClient} from "./protocol-client.ts"
import type {EventLogger} from "./logger.ts"
import {sourceMapMapper, type SourceMapMapper} from "./source-map.ts"
import type {
  InterpreterDump,
  CallFrame,
  FrameSnapshot,
  JsonObject,
  PropertyDescriptor,
  PropertySnapshot,
  RemoteObject,
  RemoteSnapshot,
  ScopeSnapshot,
} from "./types.ts"
import {serializeError} from "./errors.ts"

export type SnapshotPauseHandler = (dump: InterpreterDump) => void
export type SnapshotResumeHandler = () => void
export type ScriptParsedHandler = (script: ScriptInfo) => void
export type ScriptInfo = {
  scriptId: string
  url: string
  sourceMapURL?: string
}
export type SourceStepTarget = {
  location: {
    scriptId: string
    lineNumber: number
    columnNumber: number
  }
  source: {
    url: string
    line: number
    column: number
  }
  generated: {
    line: number
    column: number
  }
}

export class SnapshotStore {
  #client: ProtocolClient
  #logger: EventLogger
  #dumpPath: string
  #scripts = new Map<string, ScriptInfo>()
  #mappers = new Map<string, SourceMapMapper>()
  #lastCallFrames: CallFrame[] = []
  #lastDump: InterpreterDump | undefined
  #paused = false
  #pauseSequence = 0
  #pauseHandlers = new Set<SnapshotPauseHandler>()
  #resumeHandlers = new Set<SnapshotResumeHandler>()
  #scriptParsedHandlers = new Set<ScriptParsedHandler>()

  constructor(options: {
    client: ProtocolClient
    logger: EventLogger
    dumpPath: string
  }) {
    this.#client = options.client
    this.#logger = options.logger
    this.#dumpPath = options.dumpPath
  }

  get paused(): boolean {
    return this.#paused
  }

  get callFrames(): CallFrame[] {
    return this.#lastCallFrames
  }

  get dump(): InterpreterDump | undefined {
    return this.#lastDump
  }

  get scripts(): ScriptInfo[] {
    return [...this.#scripts.values()]
  }

  scriptUrl(scriptId: string): string | undefined {
    return this.#scripts.get(scriptId)?.url
  }

  scriptInfo(scriptId: string): ScriptInfo | undefined {
    return this.#scripts.get(scriptId)
  }

  sourceStepOverTarget(frameIndex = 0): SourceStepTarget | null {
    const frame = this.#lastCallFrames[frameIndex]
    if (frame === undefined) return null
    const scriptId = frame?.location?.scriptId
    const generatedLine = frame?.location?.lineNumber
    const generatedColumn = frame?.location?.columnNumber ?? 0
    if (scriptId === undefined || generatedLine === undefined) return null

    const script = this.#scripts.get(scriptId)
    if (script === undefined) return null

    const mapped = this.#originalFrameLocation(frame)
    if (mapped === undefined || mapped.sourceKind !== "sourcemap") return null

    const mapper = this.#mapperFor(scriptId)
    const content = mapper.sourceContent(mapped.source ?? script.url)
    if (content === null) return null

    const lines = content.content.split("\n")
    for (let line = mapped.line + 1; line < lines.length; line++) {
      if (!isSourceStepCandidateLine(lines[line] ?? "")) continue

      const generated = mapper.generatedLocation({
        url: content.source,
        line,
        column: 0,
      })
      if (!generated.verified) continue
      if (!isAfterLocation(generated.line, generated.column, generatedLine, generatedColumn)) continue

      return {
        location: {
          scriptId,
          lineNumber: generated.line,
          columnNumber: generated.column,
        },
        source: {
          url: content.source,
          line: line + 1,
          column: 1,
        },
        generated: {
          line: generated.line,
          column: generated.column,
        },
      }
    }

    return null
  }

  onPause(handler: SnapshotPauseHandler): () => void {
    this.#pauseHandlers.add(handler)
    return () => this.#pauseHandlers.delete(handler)
  }

  onResume(handler: SnapshotResumeHandler): () => void {
    this.#resumeHandlers.add(handler)
    return () => this.#resumeHandlers.delete(handler)
  }

  onScriptParsed(handler: ScriptParsedHandler): () => void {
    this.#scriptParsedHandlers.add(handler)
    return () => this.#scriptParsedHandlers.delete(handler)
  }

  reset(): void {
    this.#scripts.clear()
    this.#mappers.clear()
    this.#lastCallFrames = []
    this.#lastDump = undefined
    this.#paused = false
    this.#pauseSequence += 1
    this.#logger.event("snapshot.reset", {})
  }

  markRunning(): void {
    this.#paused = false
  }

  handleScriptParsed(params: JsonObject): void {
    const scriptId = asString(params["scriptId"])
    const url = asString(params["url"]) ?? ""
    const sourceMapURL = asString(params["sourceMapURL"])
    let info: ScriptInfo | undefined
    if (scriptId !== undefined) {
      info = {scriptId, url}
      if (sourceMapURL !== undefined) info.sourceMapURL = sourceMapURL
      this.#scripts.set(scriptId, info)
      this.#mappers.delete(scriptId)
    }

    this.#logger.event("Debugger.scriptParsed", {
      scriptId,
      url,
      hasSourceMap: sourceMapURL !== undefined && sourceMapURL.length > 0,
    })

    if (info !== undefined) {
      for (const handler of this.#scriptParsedHandlers) {
        try {
          handler(info)
        } catch (error) {
          this.#logger.event("snapshot.script_parsed_handler.failed", {error: serializeError(error)})
        }
      }
    }
  }

  handleResumed(): void {
    this.#paused = false
    this.#logger.event("Debugger.resumed", {})
    for (const handler of this.#resumeHandlers) {
      try {
        handler()
      } catch (error) {
        this.#logger.event("snapshot.resume_handler.failed", {error: serializeError(error)})
      }
    }
  }

  async handlePaused(params: JsonObject): Promise<void> {
    const sequence = ++this.#pauseSequence
    this.#paused = true

    const reason = asString(params["reason"]) ?? "unknown"
    const hitBreakpoints = asStringArray(params["hitBreakpoints"])
    const callFrames = asCallFrames(params["callFrames"]).slice(0, 5)
    this.#lastCallFrames = callFrames

    this.#logger.event("Debugger.paused", {
      reason,
      hitBreakpoints,
      frameCount: callFrames.length,
      topFrame: this.describeFrame(callFrames[0]),
    })

    const frames: FrameSnapshot[] = []
    for (const [index, frame] of callFrames.entries()) {
      const snapshot = this.#frameSnapshot(index, frame)
      if (index === 0) {
        snapshot.scopes = await this.#snapshotTopFrameScopes(frame)
      }
      frames.push(snapshot)
    }

    const dump: InterpreterDump = {
      timestamp: new Date().toISOString(),
      reason,
      hitBreakpoints,
      frames,
    }

    this.#lastDump = dump
    if (sequence !== this.#pauseSequence) return

    atomicWriteJson(this.#dumpPath, dump)
    this.#logger.event("interpreter.dump.written", {
      dumpPath: this.#dumpPath,
      frameCount: dump.frames.length,
    })

    for (const handler of this.#pauseHandlers) {
      try {
        handler(dump)
      } catch (error) {
        this.#logger.event("snapshot.pause_handler.failed", {error: serializeError(error)})
      }
    }
  }

  describeFrame(frame: CallFrame | undefined): JsonObject | undefined {
    if (frame === undefined) return undefined

    const scriptId = frame.location?.scriptId
    const mapped = this.#originalFrameLocation(frame)
    return {
      function: frame.functionName ?? "(anonymous)",
      scriptId,
      url: mapped?.source ?? (scriptId === undefined ? "" : this.#scripts.get(scriptId)?.url ?? ""),
      line: mapped === undefined ? undefined : mapped.line + 1,
      column: mapped === undefined ? undefined : mapped.column + 1,
    }
  }

  #frameSnapshot(index: number, frame: CallFrame): FrameSnapshot {
    const location = frame.location
    const scriptId = location?.scriptId
    const mapped = this.#originalFrameLocation(frame)

    const snapshot: FrameSnapshot = {
      index,
      function: frame.functionName ?? "(anonymous)",
      url: mapped?.source ?? (scriptId === undefined ? "" : this.#scripts.get(scriptId)?.url ?? ""),
      line: mapped === undefined ? 0 : mapped.line + 1,
      column: mapped === undefined ? 0 : mapped.column + 1,
      sourceKind: mapped?.sourceKind ?? "runtime",
      scopes: {
        local: [],
        closure: [],
      },
    }

    if (scriptId !== undefined) snapshot.scriptId = scriptId
    if (frame.callFrameId !== undefined) snapshot.callFrameId = frame.callFrameId

    return snapshot
  }

  #originalFrameLocation(frame: CallFrame): {line: number; column: number; sourceKind: "runtime" | "sourcemap"; source?: string} | undefined {
    const scriptId = frame.location?.scriptId
    const line = frame.location?.lineNumber
    const column = frame.location?.columnNumber
    if (scriptId === undefined || typeof line !== "number") return undefined

    const scriptUrl = this.#scripts.get(scriptId)?.url
    const mapper = this.#mapperFor(scriptId)
    const mapped = mapper.originalLocation({
      line,
      column: typeof column === "number" ? column : 0,
    })
    const content = mapper.sourceContent(mapped.source ?? scriptUrl)
    if (content !== null) {
      const mappedLine = mapped.source === undefined ? line : mapped.line
      const mappedColumn = mapped.source === undefined ? (typeof column === "number" ? column : 0) : mapped.column
      if (mappedLine < lineCount(content.content)) {
        return {
          line: mappedLine,
          column: mappedColumn,
          sourceKind: "sourcemap",
          source: content.source,
        }
      }
      return {
        line,
        column: typeof column === "number" ? column : 0,
        sourceKind: "runtime",
      }
    }

    const out: {line: number; column: number; sourceKind: "runtime" | "sourcemap"; source?: string} = {
      line: mapped.line,
      column: mapped.column,
      sourceKind: mapped.source === undefined ? "runtime" : "sourcemap",
    }
    if (mapped.source !== undefined) out.source = mapped.source
    return out
  }

  #mapperFor(scriptId: string): SourceMapMapper {
    const cached = this.#mappers.get(scriptId)
    if (cached !== undefined) return cached
    const built = sourceMapMapper(this.#scripts.get(scriptId)?.sourceMapURL)
    this.#mappers.set(scriptId, built)
    return built
  }

  async #snapshotTopFrameScopes(frame: CallFrame): Promise<FrameSnapshot["scopes"]> {
    const scopes: FrameSnapshot["scopes"] = {
      local: [],
      closure: [],
    }

    for (const scope of frame.scopeChain ?? []) {
      if (scope.type !== "local" && scope.type !== "closure") continue

      const objectId = scope.object?.objectId
      const snapshot: ScopeSnapshot = {
        type: scope.type,
        properties: {},
      }

      if (scope.name !== undefined) snapshot.name = scope.name
      if (objectId !== undefined) snapshot.objectId = objectId

      if (objectId === undefined) {
        snapshot.error = "scope objectId is missing"
      } else {
        try {
          snapshot.properties = await this.#getPropertyMap(objectId)
        } catch (error) {
          snapshot.error = serializeError(error)
        }
      }

      scopes[scope.type].push(snapshot)
    }

    return scopes
  }

  async #getPropertyMap(objectId: string): Promise<Record<string, PropertySnapshot>> {
    let descriptors = await this.#getDisplayablePropertyDescriptors(objectId).catch(() => [])
    if (descriptors.length === 0) {
      descriptors = await this.#getPropertyDescriptors(objectId, true)
    }
    if (descriptors.length === 0) {
      descriptors = await this.#getPropertyDescriptors(objectId, false)
    }

    const properties: Record<string, PropertySnapshot> = {}

    for (const descriptor of descriptors) {
      if (descriptor.name === undefined) continue
      properties[descriptor.name] = propertySnapshot(descriptor)
    }

    return properties
  }

  async #getDisplayablePropertyDescriptors(objectId: string): Promise<PropertyDescriptor[]> {
    const response = asObject(await this.#client.request("Runtime.getDisplayableProperties", {
      objectId,
      generatePreview: true,
    }))

    return [
      ...asPropertyDescriptors(response?.["properties"]),
      ...asPropertyDescriptors(response?.["internalProperties"]),
    ]
  }

  async #getPropertyDescriptors(objectId: string, ownProperties: boolean): Promise<PropertyDescriptor[]> {
    const response = asObject(await this.#client.request("Runtime.getProperties", {
      objectId,
      ownProperties,
      generatePreview: true,
    }))

    return asPropertyDescriptors(response?.["result"])
  }
}

export function propertySnapshot(descriptor: PropertyDescriptor): PropertySnapshot {
  const value: PropertySnapshot = descriptor.value === undefined ? {} : remoteSnapshot(descriptor.value)

  if (descriptor.get !== undefined) value.get = remoteSnapshot(descriptor.get)
  if (descriptor.set !== undefined) value.set = remoteSnapshot(descriptor.set)
  if (descriptor.wasThrown !== undefined) value.wasThrown = descriptor.wasThrown
  if (descriptor.enumerable !== undefined) value.enumerable = descriptor.enumerable
  if (descriptor.configurable !== undefined) value.configurable = descriptor.configurable
  if (descriptor.writable !== undefined) value.writable = descriptor.writable
  if (descriptor.isOwn !== undefined) value.isOwn = descriptor.isOwn

  return value
}

export function remoteSnapshot(object: RemoteObject): RemoteSnapshot {
  const snapshot: RemoteSnapshot = {}

  if (object.type !== undefined) snapshot.type = object.type
  if (object.subtype !== undefined) snapshot.subtype = object.subtype
  if (object.className !== undefined) snapshot.className = object.className
  if (object.value !== undefined) snapshot.value = object.value
  if (object.unserializableValue !== undefined) snapshot.unserializableValue = object.unserializableValue
  if (object.description !== undefined) snapshot.description = object.description
  if (object.objectId !== undefined) snapshot.objectId = object.objectId
  if (object.preview !== undefined) snapshot.preview = object.preview

  return snapshot
}

function lineCount(value: string): number {
  if (value.length === 0) return 0
  return value.endsWith("\n") ? value.split("\n").length - 1 : value.split("\n").length
}

function isSourceStepCandidateLine(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith("//")) return false
  if (trimmed.startsWith("/*")) return false
  if (trimmed.startsWith("*")) return false
  return true
}

function isAfterLocation(line: number, column: number, currentLine: number, currentColumn: number): boolean {
  return line > currentLine || (line === currentLine && column > currentColumn)
}
