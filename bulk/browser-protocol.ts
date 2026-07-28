import type {ForceMessage} from "shared/protocol/force/message"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isBulkBrowserForceMessage = (value: unknown): value is ForceMessage => {
  if (!isRecord(value) || !Array.isArray(value.parts) || value.parts.length !== 1) return false
  const part = value.parts[0]
  return (
    isRecord(part) &&
    typeof part.part === "string" &&
    part.part.length > 0 &&
    typeof part.op === "string" &&
    part.op.length > 0 &&
    typeof part.by === "string" &&
    part.by.length > 0 &&
    Number.isSafeInteger(part.ts)
  )
}

/**
 * Routes browser service-plane control before Force. A consumed control can
 * contain arbitrary extra properties and still never reaches onImpulse.
 */
export const routeBulkBrowserPayload = (
  value: unknown,
  handlers: {
    consumeControl(value: unknown): boolean
    onImpulse(message: ForceMessage): void
  },
): "control" | "force" | "invalid" => {
  if (handlers.consumeControl(value)) return "control"
  if (!isBulkBrowserForceMessage(value)) return "invalid"
  handlers.onImpulse(value)
  return "force"
}
