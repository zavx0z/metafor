import {appendFileSync, mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {serializeError} from "./errors.ts"
import {asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {JsonObject, RemoteObject} from "./types.ts"

export type ConsoleLogEntry = JsonObject & {
  timestamp: string
  event: string
  level?: string | undefined
  type?: string | undefined
  text?: string | undefined
}

export type ConsoleEntryHandler = (entry: ConsoleLogEntry) => void

export class ConsoleLogStore {
  #consoleLogPath: string
  #logger: EventLogger
  #entryHandlers = new Set<ConsoleEntryHandler>()

  constructor(options: {
    consoleLogPath: string
    logger: EventLogger
  }) {
    this.#consoleLogPath = options.consoleLogPath
    this.#logger = options.logger
    mkdirSync(dirname(this.#consoleLogPath), {recursive: true})
  }

  onEntry(handler: ConsoleEntryHandler): () => void {
    this.#entryHandlers.add(handler)
    return () => this.#entryHandlers.delete(handler)
  }

  handleMessageAdded(params: JsonObject): void {
    const message = asObject(params["message"]) ?? {}
    const entry = {
      timestamp: new Date().toISOString(),
      event: "Console.messageAdded",
      source: asString(message["source"]),
      level: asString(message["level"]),
      type: asString(message["type"]),
      text: asString(message["text"]),
      url: asString(message["url"]),
      line: asNumber(message["line"]),
      column: asNumber(message["column"]),
      repeatCount: asNumber(message["repeatCount"]),
      parameters: message["parameters"],
      raw: params,
    }

    this.#append(entry)
    this.#logger.event("Console.messageAdded", {
      level: entry.level,
      type: entry.type,
      text: entry.text,
      url: entry.url,
      line: entry.line,
      column: entry.column,
    })
  }

  handleRuntimeConsoleApiCalled(params: JsonObject): void {
    const args = Array.isArray(params["args"]) ? params["args"] : []
    const remoteArgs = args
      .map((item) => asRemoteObjectLoose(item))
      .filter((item): item is RemoteObject => item !== undefined)
    const text = remoteArgs.map(formatRemoteObject).join(" ")

    const entry = {
      timestamp: new Date().toISOString(),
      event: "Runtime.consoleAPICalled",
      type: asString(params["type"]),
      text,
      args: remoteArgs,
      executionContextId: asNumber(params["executionContextId"]),
      rawTimestamp: asNumber(params["timestamp"]),
      stackTrace: params["stackTrace"],
      raw: params,
    }

    this.#append(entry)
    this.#logger.event("Runtime.consoleAPICalled", {
      type: entry.type,
      text,
      executionContextId: entry.executionContextId,
    })
  }

  #append(entry: ConsoleLogEntry): void {
    try {
      appendFileSync(this.#consoleLogPath, `${JSON.stringify(entry)}\n`)
    } catch (error) {
      this.#logger.status(`failed to write console log: ${serializeError(error)}`)
    }
    for (const handler of this.#entryHandlers) {
      try {
        handler(entry)
      } catch (error) {
        this.#logger.status(`console entry handler failed: ${serializeError(error)}`)
      }
    }
  }
}

function asRemoteObjectLoose(value: unknown): RemoteObject | undefined {
  const object = asObject(value)
  if (object === undefined) return undefined

  const remoteObject: RemoteObject = {}
  const type = asString(object["type"])
  const subtype = asString(object["subtype"])
  const className = asString(object["className"])
  const unserializableValue = asString(object["unserializableValue"])
  const description = asString(object["description"])
  const objectId = asString(object["objectId"])

  if (type !== undefined) remoteObject.type = type
  if (subtype !== undefined) remoteObject.subtype = subtype
  if (className !== undefined) remoteObject.className = className
  if (object["value"] !== undefined) remoteObject.value = object["value"]
  if (unserializableValue !== undefined) remoteObject.unserializableValue = unserializableValue
  if (description !== undefined) remoteObject.description = description
  if (objectId !== undefined) remoteObject.objectId = objectId
  if (object["preview"] !== undefined) remoteObject.preview = object["preview"]

  return remoteObject
}

function formatRemoteObject(object: RemoteObject): string {
  if (object.value !== undefined) return String(object.value)
  if (object.unserializableValue !== undefined) return object.unserializableValue
  if (object.description !== undefined) return object.description
  if (object.className !== undefined) return object.className
  return object.type ?? "<unknown>"
}
