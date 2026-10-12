import type {PeerSignal} from "./contracts"

export const MAX_SIGNAL_BYTES = 256 * 1024
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024
export function messageLimit(value = MAX_MESSAGE_BYTES): number {
  positive(value, "peer message limit")
  if (value > 32 * 1024 * 1024) throw new Error("Peer message limit exceeds 32 MiB")
  return value
}
export const FRAME_BYTES = 16 * 1024
export const CHANNEL_LABEL = "metafor-peer-v1"
export function dataChannelNames(configured?: readonly string[]): readonly string[] {
  if (configured === undefined) return [CHANNEL_LABEL]
  if (!Array.isArray(configured) || configured.length < 1 || configured.length > 16 ||
      configured.some(name => typeof name !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(name)) ||
      new Set(configured).size !== configured.length) throw new Error("Invalid peer physical channels")
  return Object.freeze([...configured])
}
export const encoder = new TextEncoder()
export const decoder = new TextDecoder("utf-8", {fatal: true})

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_.:@-]{1,128}$/.test(value)
}

export function parseSignal(value: unknown): PeerSignal {
  if (!value || typeof value !== "object") throw new Error("Invalid peer signal")
  const v = value as Record<string, unknown>
  const d = v.description as Record<string, unknown> | undefined
  if (!validId(v.from) || !validId(v.to) || v.from === v.to || !validId(v.generation) ||
    (v.via !== undefined && !validId(v.via)) || !d ||
    (d.type !== "offer" && d.type !== "answer") || typeof d.sdp !== "string" ||
    encoder.encode(d.sdp).byteLength > MAX_SIGNAL_BYTES - 1024)
    throw new Error("Invalid peer signal")
  return {
    from: v.from, to: v.to, generation: v.generation,
    description: {type: d.type, sdp: d.sdp},
    ...(v.via === undefined ? {} : {via: v.via as string}),
  }
}

export function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${label}`)
  return value
}
