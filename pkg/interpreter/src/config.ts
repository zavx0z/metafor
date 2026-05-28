import {dirname} from "node:path"

export const DEFAULT_PROTOCOL_URL = "ws://127.0.0.1:6499/"
export const DEFAULT_DUMP_PATH = ".metafor/interpreter/state.json"
export const DEFAULT_RECONNECT_DELAY_MS = 1_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
export const DEFAULT_INITIALIZE_FALLBACK_MS = 1_500
export const DEFAULT_HTTP_HOST = "127.0.0.1"
export const DEFAULT_HTTP_PORT = 6500

export type InterpreterConfig = {
  protocolUrl: string
  dumpPath: string
  eventLogPath: string
  consoleLogPath: string
  requestTimeoutMs: number
  initializedFallbackMs: number
  reconnectDelayMs: number
  httpEnabled: boolean
  httpHost: string
  httpPort: number
}

export function loadConfig(env: Record<string, string | undefined> = Bun.env): InterpreterConfig {
  const dumpPath = env["INTERPRETER_DUMP_PATH"] ?? DEFAULT_DUMP_PATH

  return {
    protocolUrl: env["BUN_PROTOCOL_URL"] ?? DEFAULT_PROTOCOL_URL,
    dumpPath,
    eventLogPath: env["INTERPRETER_EVENT_LOG_PATH"] ?? `${dirname(dumpPath)}/events.log`,
    consoleLogPath: env["INTERPRETER_CONSOLE_LOG_PATH"] ?? `${dirname(dumpPath)}/console.log`,
    requestTimeoutMs: parseNonNegativeInteger(env["INTERPRETER_REQUEST_TIMEOUT_MS"], DEFAULT_REQUEST_TIMEOUT_MS),
    initializedFallbackMs: parseNonNegativeInteger(env["INTERPRETER_INITIALIZE_FALLBACK_MS"], DEFAULT_INITIALIZE_FALLBACK_MS),
    reconnectDelayMs: parseNonNegativeInteger(env["INTERPRETER_RECONNECT_DELAY_MS"], DEFAULT_RECONNECT_DELAY_MS),
    httpEnabled: parseBoolean(env["INTERPRETER_HTTP_ENABLED"], true),
    httpHost: env["INTERPRETER_HTTP_HOST"] ?? DEFAULT_HTTP_HOST,
    httpPort: parseNonNegativeInteger(env["INTERPRETER_HTTP_PORT"], DEFAULT_HTTP_PORT),
  }
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false
  return fallback
}

export function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}
