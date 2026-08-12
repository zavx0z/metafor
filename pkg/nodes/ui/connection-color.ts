import {Color} from "@metafor/engine"
import {palette} from "@ui/elements"

export const NODE_SYSTEM_CONNECTION_TYPES = [
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

const CONNECTION_COLORS = new Map<string, Color>([
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

/** Stable semantic color; direction and live state never participate. */
export function nodeSystemConnectionColor(connectionType: string | undefined): Color {
  if (connectionType === undefined) return palette.border
  return CONNECTION_COLORS.get(connectionType) ?? fallbackConnectionColor(connectionType)
}

function fallbackConnectionColor(connectionType: string): Color {
  let hash = 2166136261
  for (let index = 0; index < connectionType.length; index += 1) {
    hash ^= connectionType.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hslColor(hash % 360, 0.68, 0.64)
}

function hslColor(hue: number, saturation: number, lightness: number): Color {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const h = hue / 60
  const x = chroma * (1 - Math.abs(h % 2 - 1))
  const [r1, g1, b1] = h < 1 ? [chroma, x, 0]
    : h < 2 ? [x, chroma, 0]
      : h < 3 ? [0, chroma, x]
        : h < 4 ? [0, x, chroma]
          : h < 5 ? [x, 0, chroma]
            : [chroma, 0, x]
  const m = lightness - chroma / 2
  return new Color(r1 + m, g1 + m, b1 + m, 1)
}
