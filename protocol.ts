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
  patches: ProtocolPatch[]
}

export type TypedBroadcastChannel<TMessage> = Omit<BroadcastChannel, "onmessage" | "postMessage"> & {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<TMessage>) => unknown) | null
  postMessage(message: TMessage): void
}

export type ProtocolChannel = TypedBroadcastChannel<ProtocolMessage>

export const createProtocolChannel = (channelName = METAFOR_BROADCAST_CHANNEL): ProtocolChannel =>
  new BroadcastChannel(channelName) as ProtocolChannel
