export const METAFOR_FORCE_CHANNEL = "metafor.force"

export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w" | "-z" | "+z"
export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export type Particle = {
  part: Part
  op: ParticleOperation
  path: string
  value?: unknown
  from?: string
  [key: string]: unknown
}

export type ForceMessage = {
  parts: Particle[]
}

export type ForceMessageHandler = ((this: BroadcastChannel, ev: MessageEvent<ForceMessage>) => unknown) | null

export interface ForceSurface {
  onmessage: ForceMessageHandler
  postMessage(message: ForceMessage): void
}

export interface Force extends ForceSurface {
  close(): void
}

export type TypedBroadcastChannel<TMessage> = Omit<BroadcastChannel, "onmessage" | "postMessage"> & {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<TMessage>) => unknown) | null
  postMessage(message: TMessage): void
}

export type ForceChannel = TypedBroadcastChannel<ForceMessage>

let forceChannel: ForceChannel | null = null

const getForceChannel = (): ForceChannel => {
  forceChannel ??= new BroadcastChannel(METAFOR_FORCE_CHANNEL) as ForceChannel
  return forceChannel
}

export const getForceOnMessage = (): ForceMessageHandler => getForceChannel().onmessage

export const setForceOnMessage = (handler: ForceMessageHandler): void => {
  getForceChannel().onmessage = handler
}

const dispatchForceMessage = (message: ForceMessage): void => {
  const channel = getForceChannel()
  channel.onmessage?.call(channel, {data: message} as MessageEvent<ForceMessage>)
}

export const emitForceMessage = (message: ForceMessage): void => {
  getForceChannel().postMessage(message)
  dispatchForceMessage(message)
}

export const emitForceParts = (parts: Particle[]): void => {
  emitForceMessage({parts})
}

export const emitGravitonAdd = (path: string, value?: unknown): void => {
  emitForceParts([{part: "graviton", op: "add", path, ...(value !== undefined ? {value} : {})}])
}

export const closeForceChannel = (): void => {
  forceChannel?.close()
  forceChannel = null
}

export const force: Force = {
  get onmessage(): ForceMessageHandler {
    return getForceOnMessage()
  },
  set onmessage(handler: ForceMessageHandler) {
    setForceOnMessage(handler)
  },
  postMessage(message: ForceMessage): void {
    emitForceMessage(message)
  },
  close(): void {
    closeForceChannel()
  },
}
