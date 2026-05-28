import {asNumber, asObject, asString} from "./guards.ts"

export function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function makeInspectorError(method: string, error: unknown): Error {
  const data = asObject(error)
  const code = asNumber(data?.["code"])
  const message = asString(data?.["message"]) ?? "inspector request failed"
  const details = code === undefined ? message : `${message} (${code})`
  return new Error(`${method}: ${details}`)
}
