import {atomicWriteJson} from "./fs.ts"
import {asCallFrames, asObject, asPropertyDescriptors, asString, asStringArray} from "./guards.ts"
import type {InspectorClient} from "./inspector-client.ts"
import type {EventLogger} from "./logger.ts"
import type {
  AgentDump,
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

export type SnapshotPauseHandler = (dump: AgentDump) => void
export type SnapshotResumeHandler = () => void
export type ScriptParsedHandler = (scriptId: string, url: string) => void

export class SnapshotStore {
  #client: InspectorClient
  #logger: EventLogger
  #dumpPath: string
  #scriptUrls = new Map<string, string>()
  #lastCallFrames: CallFrame[] = []
  #lastDump: AgentDump | undefined
  #paused = false
  #pauseSequence = 0
  #pauseHandlers = new Set<SnapshotPauseHandler>()
  #resumeHandlers = new Set<SnapshotResumeHandler>()
  #scriptParsedHandlers = new Set<ScriptParsedHandler>()

  constructor(options: {
    client: InspectorClient
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

  get dump(): AgentDump | undefined {
    return this.#lastDump
  }

  get scripts(): Array<{scriptId: string; url: string}> {
    const entries: Array<{scriptId: string; url: string}> = []
    for (const [scriptId, url] of this.#scriptUrls) entries.push({scriptId, url})
    return entries
  }

  scriptUrl(scriptId: string): string | undefined {
    return this.#scriptUrls.get(scriptId)
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

  markRunning(): void {
    this.#paused = false
  }

  handleScriptParsed(params: JsonObject): void {
    const scriptId = asString(params["scriptId"])
    const url = asString(params["url"]) ?? ""
    if (scriptId !== undefined) this.#scriptUrls.set(scriptId, url)

    this.#logger.event("Debugger.scriptParsed", {
      scriptId,
      url,
    })

    if (scriptId !== undefined) {
      for (const handler of this.#scriptParsedHandlers) {
        try {
          handler(scriptId, url)
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

    const dump: AgentDump = {
      timestamp: new Date().toISOString(),
      reason,
      hitBreakpoints,
      frames,
    }

    this.#lastDump = dump
    if (sequence !== this.#pauseSequence) return

    atomicWriteJson(this.#dumpPath, dump)
    this.#logger.event("agent.dump.written", {
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
    return {
      function: frame.functionName ?? "(anonymous)",
      scriptId,
      url: scriptId === undefined ? "" : this.#scriptUrls.get(scriptId) ?? "",
      line: frame.location?.lineNumber === undefined ? undefined : frame.location.lineNumber + 1,
      column: frame.location?.columnNumber === undefined ? undefined : frame.location.columnNumber + 1,
    }
  }

  #frameSnapshot(index: number, frame: CallFrame): FrameSnapshot {
    const location = frame.location
    const scriptId = location?.scriptId
    const lineNumber = location?.lineNumber
    const columnNumber = location?.columnNumber

    const snapshot: FrameSnapshot = {
      index,
      function: frame.functionName ?? "(anonymous)",
      url: scriptId === undefined ? "" : this.#scriptUrls.get(scriptId) ?? "",
      line: typeof lineNumber === "number" ? lineNumber + 1 : 0,
      column: typeof columnNumber === "number" ? columnNumber + 1 : 0,
      scopes: {
        local: [],
        closure: [],
      },
    }

    if (scriptId !== undefined) snapshot.scriptId = scriptId
    if (frame.callFrameId !== undefined) snapshot.callFrameId = frame.callFrameId

    return snapshot
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
