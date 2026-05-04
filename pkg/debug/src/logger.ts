import {appendFileSync, mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {serializeError} from "./errors.ts"
import type {JsonObject} from "./types.ts"

export class EventLogger {
  readonly eventLogPath: string

  constructor(eventLogPath: string) {
    this.eventLogPath = eventLogPath
    mkdirSync(dirname(eventLogPath), {recursive: true})
  }

  status(message: string): void {
    process.stderr.write(`[bun-debug-agent] ${message}\n`)
  }

  event(event: string, detail: JsonObject = {}): void {
    try {
      appendFileSync(this.eventLogPath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...detail,
      })}\n`)
    } catch (error) {
      process.stderr.write(`[bun-debug-agent] failed to write event log: ${serializeError(error)}\n`)
    }
  }
}
