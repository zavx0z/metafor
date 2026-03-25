export const METAFOR_PROTOCOL_KIND = "metafor"
export const GRAVITY_BROADCAST_CHANNEL = "metafor.gravity"
export const ELECTROMAGNETISM_BROADCAST_CHANNEL = "metafor.electromagnetism"
export const GLUON_BROADCAST_CHANNEL = "metafor.gluon"
export const HIGGS_BROADCAST_CHANNEL = "metafor.higgs"

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

export interface ValueProtocolPatch {
  op: "replace"
  path: string
  value: unknown
}

export interface GluonMessage {
  protocol: typeof METAFOR_PROTOCOL_KIND
  channel: "gluon"
  boson: "gluon"
  source: ProtocolDomain
  target: ProtocolTarget
  patches: ValueProtocolPatch[]
}

export interface HiggsMessage {
  protocol: typeof METAFOR_PROTOCOL_KIND
  channel: "higgs"
  boson: "higgs"
  source: ProtocolDomain
  target: ProtocolTarget
  patches: ValueProtocolPatch[]
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

export const openGluonBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  new BroadcastChannel(options.channelName ?? GLUON_BROADCAST_CHANNEL)

export const openHiggsBroadcastChannel = (options: ProtocolChannelOptions = {}): BroadcastChannel =>
  new BroadcastChannel(options.channelName ?? HIGGS_BROADCAST_CHANNEL)

const isValueProtocolPatch = (value: unknown): value is ValueProtocolPatch => {
  if (!isRecord(value)) return false
  return value.op === "replace" && typeof value.path === "string" && "value" in value
}

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

export const isGluonMessage = (value: unknown): value is GluonMessage => {
  if (!isRecord(value)) return false
  if (value.protocol !== METAFOR_PROTOCOL_KIND) return false
  if (value.channel !== "gluon") return false
  if (value.boson !== "gluon") return false
  if (value.source !== "dark" && value.source !== "boundary") return false
  if (value.target !== "dark" && value.target !== "boundary" && value.target !== "broadcast") return false
  return Array.isArray(value.patches) && value.patches.every(isValueProtocolPatch)
}

export const isHiggsMessage = (value: unknown): value is HiggsMessage => {
  if (!isRecord(value)) return false
  if (value.protocol !== METAFOR_PROTOCOL_KIND) return false
  if (value.channel !== "higgs") return false
  if (value.boson !== "higgs") return false
  if (value.source !== "dark" && value.source !== "boundary") return false
  if (value.target !== "dark" && value.target !== "boundary" && value.target !== "broadcast") return false
  return Array.isArray(value.patches) && value.patches.every(isValueProtocolPatch)
}
