export const FORCE = "force"

export type EnergyParticle = {
  part: string
  op: string
  path: string
  value?: unknown
  from?: string
  [key: string]: unknown
}

export type EnergyForceMessage = {
  parts: EnergyParticle[]
}

export type EnergyForceMessageListener = (this: BroadcastChannel, ev: MessageEvent<EnergyForceMessage>) => unknown

export interface EnergyForceBinding {
  close(): void
}

export interface EnergyForceSurface {
  observe(listener: EnergyForceMessageListener): EnergyForceBinding
  entropy(listener: EnergyForceMessageListener): EnergyForceBinding
  emit(message: EnergyForceMessage): void
  absorb(message: EnergyForceMessage): void
}

export interface EnergyForce extends EnergyForceSurface {
  close(): void
}

export type TypedEnergyBroadcastChannel<TMessage> = Omit<BroadcastChannel, "onmessage" | "postMessage"> & {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<TMessage>) => unknown) | null
  postMessage(message: TMessage): void
}

export type EnergyForceChannel = TypedEnergyBroadcastChannel<EnergyForceMessage>

let forceChannel: EnergyForceChannel | null = null
const forceObservers = new Set<EnergyForceMessageListener>()
const forceEntropy = new Set<EnergyForceMessageListener>()

const getForceChannel = (): EnergyForceChannel => {
  if (forceChannel === null) {
    forceChannel = new BroadcastChannel(FORCE) as EnergyForceChannel
    forceChannel.onmessage = dispatchForceObservers
  }
  return forceChannel
}

const dispatchForceObservers = (event: MessageEvent<EnergyForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceObservers]) listener.call(channel, event)
}

const dispatchForceEntropy = (event: MessageEvent<EnergyForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceEntropy]) listener.call(channel, event)
}

const bindForceListener = (
  listeners: Set<EnergyForceMessageListener>,
  listener: EnergyForceMessageListener,
): EnergyForceBinding => {
  listeners.add(listener)
  getForceChannel()

  return {
    close() {
      listeners.delete(listener)
    },
  }
}

export const observeForceMessage = (listener: EnergyForceMessageListener): EnergyForceBinding =>
  bindForceListener(forceObservers, listener)

export const entropyForceMessage = (listener: EnergyForceMessageListener): EnergyForceBinding =>
  bindForceListener(forceEntropy, listener)

export const absorbForceMessage = (message: EnergyForceMessage): void => {
  dispatchForceObservers({data: message} as MessageEvent<EnergyForceMessage>)
}

export const emitForceMessage = (message: EnergyForceMessage): void => {
  const event = {data: message} as MessageEvent<EnergyForceMessage>
  getForceChannel().postMessage(message)
  dispatchForceObservers(event)
  dispatchForceEntropy(event)
}

export const emitForceParts = (parts: EnergyParticle[]): void => {
  emitForceMessage({parts})
}

export const closeForceChannel = (): void => {
  forceChannel?.close()
  forceChannel = null
  forceObservers.clear()
  forceEntropy.clear()
}

export const force: EnergyForce = {
  observe(listener: EnergyForceMessageListener): EnergyForceBinding {
    return observeForceMessage(listener)
  },
  entropy(listener: EnergyForceMessageListener): EnergyForceBinding {
    return entropyForceMessage(listener)
  },
  emit(message: EnergyForceMessage): void {
    emitForceMessage(message)
  },
  absorb(message: EnergyForceMessage): void {
    absorbForceMessage(message)
  },
  close(): void {
    closeForceChannel()
  },
}
