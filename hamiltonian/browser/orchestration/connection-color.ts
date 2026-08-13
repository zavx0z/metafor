import {Color} from "@metafor/engine"
import {defaultNodeSystemConnectionColor} from "@nodes/ui/connection-color"

/** Product vocabulary owned by Hamiltonian, never by the generic node UI. */
export const HAMILTONIAN_CONNECTION_TYPES = [
  "ipc",
  "websocket",
  "web-push",
  "service-worker-api",
  "worker-messaging",
  "service-worker-controller",
  "message-port",
  "broadcast-channel",
  "oracle-rtc-data-channel",
  "force-rtc-data-channel",
] as const

const HAMILTONIAN_CONNECTION_COLORS = new Map<string, Color>([
  ["ipc", new Color("#f2c55c")],
  ["websocket", new Color("#56a8f5")],
  ["web-push", new Color("#c77dbb")],
  ["service-worker-api", new Color("#42d98b")],
  ["worker-messaging", new Color("#2aacb8")],
  ["service-worker-controller", new Color("#78a8ff")],
  ["message-port", new Color("#ff9f66")],
  ["broadcast-channel", new Color("#55c7d9")],
  ["oracle-rtc-data-channel", new Color("#9a8cff")],
  ["force-rtc-data-channel", new Color("#ff7f9f")],
])

/** Hamiltonian maps its transport families while the shared UI owns fallback only. */
export function hamiltonianConnectionColor(connectionType: string | undefined): Color {
  if (connectionType === undefined) return defaultNodeSystemConnectionColor(undefined)
  return HAMILTONIAN_CONNECTION_COLORS.get(connectionType)
    ?? defaultNodeSystemConnectionColor(connectionType)
}
