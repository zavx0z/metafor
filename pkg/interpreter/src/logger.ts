import {appendFileSync, mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {serializeError} from "./errors.ts"
import type {JsonObject} from "./types.ts"

export type InterpreterEventEntry = JsonObject & {timestamp: string; event: string}
export type InterpreterEventHandler = (entry: InterpreterEventEntry) => void
const STATUS_PREFIX = "[interpreter]"

export class EventLogger {
  readonly eventLogPath: string
  #eventHandlers = new Set<InterpreterEventHandler>()

  constructor(eventLogPath: string) {
    this.eventLogPath = eventLogPath
    mkdirSync(dirname(eventLogPath), {recursive: true})
  }

  onEvent(handler: InterpreterEventHandler): () => void {
    this.#eventHandlers.add(handler)
    return () => this.#eventHandlers.delete(handler)
  }

  status(message: string): void {
    process.stderr.write(`${STATUS_PREFIX} ${message}\n`)
  }

  event(event: string, detail: JsonObject = {}): void {
    const entry: InterpreterEventEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...detail,
    }
    try {
      appendFileSync(this.eventLogPath, `${JSON.stringify(entry)}\n`)
    } catch (error) {
      process.stderr.write(`${STATUS_PREFIX} failed to write event log: ${serializeError(error)}\n`)
    }
    for (const handler of this.#eventHandlers) {
      try {
        handler(entry)
      } catch (handlerError) {
        process.stderr.write(`${STATUS_PREFIX} event handler failed: ${serializeError(handlerError)}\n`)
      }
    }
  }
}
