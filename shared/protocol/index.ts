export const METAFOR_PROTOCOL_KIND = "metafor"
export const GRAVITY_BROADCAST_CHANNEL = "metafor.gravity"
export const ELECTROMAGNETISM_BROADCAST_CHANNEL = "metafor.electromagnetism"

export type ProtocolDomain = "dark" | "boundary"
export type ProtocolTarget = ProtocolDomain | "broadcast"

export interface ProtocolChannelOptions {
  channelName?: string
}

export interface GravityProtocolPatch {
  op: "add" | "remove" | "test"
  path: string
  value?: unknown
}

export interface GravitonMessage {
  protocol: typeof METAFOR_PROTOCOL_KIND
  channel: "gravity"
  boson: "graviton"
  source: ProtocolDomain
  target: ProtocolTarget
  patches: GravityProtocolPatch[]
}

export interface PhotonMessage {
  protocol: typeof METAFOR_PROTOCOL_KIND
  channel: "electromagnetism"
  boson: "photon"
  source: ProtocolDomain
  target: ProtocolTarget
  value: string
  path: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const isGravityPatch = (value: unknown): value is GravityProtocolPatch => {
  if (!isRecord(value)) return false
  if (value.op !== "add" && value.op !== "remove" && value.op !== "test") return false
  return typeof value.path === "string"
}

export const openGravityBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  new BroadcastChannel(options.channelName ?? GRAVITY_BROADCAST_CHANNEL)

export const openElectromagnetismBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  new BroadcastChannel(options.channelName ?? ELECTROMAGNETISM_BROADCAST_CHANNEL)

export const isGravitonMessage = (value: unknown): value is GravitonMessage => {
  if (!isRecord(value)) return false
  if (value.protocol !== METAFOR_PROTOCOL_KIND) return false
  if (value.channel !== "gravity") return false
  if (value.boson !== "graviton") return false
  if (value.source !== "dark" && value.source !== "boundary") return false
  if (value.target !== "dark" && value.target !== "boundary" && value.target !== "broadcast") return false
  return Array.isArray(value.patches) && value.patches.every(isGravityPatch)
}

export const isPhotonMessage = (value: unknown): value is PhotonMessage => {
  if (!isRecord(value)) return false
  if (value.protocol !== METAFOR_PROTOCOL_KIND) return false
  if (value.channel !== "electromagnetism") return false
  if (value.boson !== "photon") return false
  if (value.source !== "dark" && value.source !== "boundary") return false
  if (value.target !== "dark" && value.target !== "boundary" && value.target !== "broadcast") return false
  return typeof value.value === "string" && typeof value.path === "string"
}
