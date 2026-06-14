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

export interface ForceBinding {
  close(): void
}

export interface ForceSurface {
  observe(listener: ForceMessageListener): ForceBinding
  entropy(listener: ForceMessageListener): ForceBinding
  emit(message: ForceMessage): void | Promise<void>
  absorb(message: ForceMessage): void | Promise<void>
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
const forceObservers = new Set<ForceMessageListener>()
const forceEntropy = new Set<ForceMessageListener>()

const dispatchForceObservers = (event: MessageEvent<ForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceObservers]) listener.call(channel, event)
}

const dispatchForceEntropy = (event: MessageEvent<ForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceEntropy]) listener.call(channel, event)
}

const getForceChannel = (): ForceChannel => {
  if (forceChannel === null) {
    forceChannel = new BroadcastChannel(METAFOR_FORCE_CHANNEL) as ForceChannel
    forceChannel.onmessage = dispatchForceObservers
  }
  return forceChannel
}

const bindForceListener = (listeners: Set<ForceMessageListener>, listener: ForceMessageListener): ForceBinding => {
  listeners.add(listener)
  getForceChannel()

  return {
    close() {
      listeners.delete(listener)
    },
  }
}

export const observeForceMessage = (listener: ForceMessageListener): ForceBinding =>
  bindForceListener(forceObservers, listener)

export const entropyForceMessage = (listener: ForceMessageListener): ForceBinding =>
  bindForceListener(forceEntropy, listener)

export const absorbForceMessage = (message: ForceMessage): void => {
  dispatchForceObservers({data: message} as MessageEvent<ForceMessage>)
}

export const emitForceMessage = (message: ForceMessage): void => {
  const event = {data: message} as MessageEvent<ForceMessage>
  getForceChannel().postMessage(message)
  dispatchForceObservers(event)
  dispatchForceEntropy(event)
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
  forceObservers.clear()
  forceEntropy.clear()
}

export const force: Force = {
  observe(listener: ForceMessageListener): ForceBinding {
    return observeForceMessage(listener)
  },
  entropy(listener: ForceMessageListener): ForceBinding {
    return entropyForceMessage(listener)
  },
  emit(message: ForceMessage): void {
    emitForceMessage(message)
  },
  absorb(message: ForceMessage): void {
    absorbForceMessage(message)
  },
  close(): void {
    closeForceChannel()
  },
}
