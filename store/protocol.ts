export const METAFOR_BROADCAST_CHANNEL = "metafor.protocol"

export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"
export type JsonPatchOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export type ProtocolPatch = {
  part: Part
  op: JsonPatchOperation
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

let protocolChannel: ProtocolChannel | null = null

const getProtocolChannel = (): ProtocolChannel => {
  protocolChannel ??= createProtocolChannel()
  return protocolChannel
}

export const emitProtocolMessage = (message: ProtocolMessage): void => {
  getProtocolChannel().postMessage(message)
}

export const emitProtocolPatches = (patches: ProtocolPatch[]): void => {
  emitProtocolMessage({patches})
}

export const emitGravitonAdd = (path: string, value?: unknown): void => {
  emitProtocolPatches([{part: "graviton", op: "add", path, ...(value !== undefined ? {value} : {})}])
}

export const closeProtocolChannel = (): void => {
  protocolChannel?.close()
  protocolChannel = null
}
