import {appendFileSync, mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {serializeError} from "./errors.ts"
import type {JsonObject} from "./types.ts"

export type AgentEventEntry = JsonObject & {timestamp: string; event: string}
export type AgentEventHandler = (entry: AgentEventEntry) => void

export class EventLogger {
  readonly eventLogPath: string
  #eventHandlers = new Set<AgentEventHandler>()

  constructor(eventLogPath: string) {
    this.eventLogPath = eventLogPath
    mkdirSync(dirname(eventLogPath), {recursive: true})
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.#eventHandlers.add(handler)
    return () => this.#eventHandlers.delete(handler)
  }

  status(message: string): void {
    process.stderr.write(`[bun-debug-agent] ${message}\n`)
  }

  event(event: string, detail: JsonObject = {}): void {
    const entry: AgentEventEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...detail,
    }
    try {
      appendFileSync(this.eventLogPath, `${JSON.stringify(entry)}\n`)
    } catch (error) {
      process.stderr.write(`[bun-debug-agent] failed to write event log: ${serializeError(error)}\n`)
    }
    for (const handler of this.#eventHandlers) {
      try {
        handler(entry)
      } catch (handlerError) {
        process.stderr.write(`[bun-debug-agent] event handler failed: ${serializeError(handlerError)}\n`)
      }
    }
  }
}
