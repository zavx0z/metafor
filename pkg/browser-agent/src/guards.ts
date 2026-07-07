import type {BrowserAgentJsonObject} from "./types.ts"

export function asObject(value: unknown): BrowserAgentJsonObject | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as BrowserAgentJsonObject
  }
  return undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}
