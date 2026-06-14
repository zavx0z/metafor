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

export type ForceMessageListener = (this: BroadcastChannel, ev: MessageEvent<ForceMessage>) => unknown

export interface ForceSubscription {
  close(): void
}

export interface ForceSurface {
  subscribe(listener: ForceMessageListener): ForceSubscription
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
const forceListeners = new Set<ForceMessageListener>()

const dispatchForceEvent = (event: MessageEvent<ForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceListeners]) listener.call(channel, event)
}

const getForceChannel = (): ForceChannel => {
  if (forceChannel === null) {
    forceChannel = new BroadcastChannel(METAFOR_FORCE_CHANNEL) as ForceChannel
    forceChannel.onmessage = dispatchForceEvent
  }
  return forceChannel
}

export const subscribeForceMessage = (listener: ForceMessageListener): ForceSubscription => {
  forceListeners.add(listener)
  getForceChannel()

  return {
    close() {
      forceListeners.delete(listener)
    },
  }
}

const dispatchForceMessage = (message: ForceMessage): void => {
  dispatchForceEvent({data: message} as MessageEvent<ForceMessage>)
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
  forceListeners.clear()
}

export const force: Force = {
  subscribe(listener: ForceMessageListener): ForceSubscription {
    return subscribeForceMessage(listener)
  },
  postMessage(message: ForceMessage): void {
    emitForceMessage(message)
  },
  close(): void {
    closeForceChannel()
  },
}
