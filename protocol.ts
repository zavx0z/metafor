export const METAFOR_BROADCAST_CHANNEL = "metafor.protocol"

export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"

export type ProtocolPatch = {
  part: Part
  op: string
  path: string
  value?: unknown
  from?: string
  [key: string]: unknown
}

export type ProtocolMessage = {
  patches?: ProtocolPatch[]
}

export const createProtocolChannel = (channelName = METAFOR_BROADCAST_CHANNEL): BroadcastChannel =>
  new BroadcastChannel(channelName)

export const protocolPatches = (message: unknown): ProtocolPatch[] => {
  if (!message || typeof message !== "object") return []
  const patches = (message as { patches?: unknown }).patches
  if (!Array.isArray(patches)) return []
  return patches.filter(isProtocolPatch)
}

export const postProtocolPatches = (channel: BroadcastChannel, patches: ProtocolPatch[]): void => {
  if (patches.length === 0) return
  channel.postMessage({ patches })
}

const isProtocolPatch = (patch: unknown): patch is ProtocolPatch => {
  if (!patch || typeof patch !== "object") return false
  const candidate = patch as { part?: unknown; op?: unknown; path?: unknown }
  return isPart(candidate.part) && typeof candidate.op === "string" && typeof candidate.path === "string"
}

const isPart = (part: unknown): part is Part =>
  part === "graviton" ||
  part === "photon" ||
  part === "gluon" ||
  part === "higgs" ||
  part === "w" ||
  part === "-z" ||
  part === "+z"
