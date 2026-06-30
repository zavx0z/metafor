export const FORCE = "force"

export type MatrixDomainPath = string | number

export type MatrixParticle = {
  part: string
  op: string
  path: MatrixDomainPath
  value?: unknown
  from?: MatrixDomainPath
  [key: string]: unknown
}

export type MatrixForceMessage = {
  parts: MatrixParticle[]
}

export type MatrixForceMessageListener = (this: BroadcastChannel, ev: MessageEvent<MatrixForceMessage>) => unknown

export interface MatrixForceBinding {
  close(): void
}

export interface MatrixForceSurface {
  observe(listener: MatrixForceMessageListener): MatrixForceBinding
  entropy(listener: MatrixForceMessageListener): MatrixForceBinding
  emit(message: MatrixForceMessage): void
  absorb(message: MatrixForceMessage): void
}

export interface MatrixForce extends MatrixForceSurface {
  close(): void
}

export type TypedMatrixBroadcastChannel<TMessage> = Omit<BroadcastChannel, "onmessage" | "postMessage"> & {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<TMessage>) => unknown) | null
  postMessage(message: TMessage): void
}

export type MatrixForceChannel = TypedMatrixBroadcastChannel<MatrixForceMessage>

let forceChannel: MatrixForceChannel | null = null
const forceObservers = new Set<MatrixForceMessageListener>()
const forceEntropy = new Set<MatrixForceMessageListener>()

const getForceChannel = (): MatrixForceChannel => {
  if (forceChannel === null) {
    forceChannel = new BroadcastChannel(FORCE) as MatrixForceChannel
    forceChannel.onmessage = dispatchForceObservers
  }
  return forceChannel
}

const dispatchForceObservers = (event: MessageEvent<MatrixForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceObservers]) listener.call(channel, event)
}

const dispatchForceEntropy = (event: MessageEvent<MatrixForceMessage>): void => {
  const channel = getForceChannel()
  for (const listener of [...forceEntropy]) listener.call(channel, event)
}

const bindForceListener = (
  listeners: Set<MatrixForceMessageListener>,
  listener: MatrixForceMessageListener,
): MatrixForceBinding => {
  listeners.add(listener)
  getForceChannel()

  return {
    close() {
      listeners.delete(listener)
    },
  }
}

export const observeForceMessage = (listener: MatrixForceMessageListener): MatrixForceBinding =>
  bindForceListener(forceObservers, listener)

export const entropyForceMessage = (listener: MatrixForceMessageListener): MatrixForceBinding =>
  bindForceListener(forceEntropy, listener)

export const absorbForceMessage = (message: MatrixForceMessage): void => {
  dispatchForceObservers({data: message} as MessageEvent<MatrixForceMessage>)
}

export const emitForceMessage = (message: MatrixForceMessage): void => {
  const event = {data: message} as MessageEvent<MatrixForceMessage>
  getForceChannel().postMessage(message)
  dispatchForceObservers(event)
  dispatchForceEntropy(event)
}

export const emitForceParts = (parts: MatrixParticle[]): void => {
  emitForceMessage({parts})
}

export const closeForceChannel = (): void => {
  forceChannel?.close()
  forceChannel = null
  forceObservers.clear()
  forceEntropy.clear()
}

export const force: MatrixForce = {
  observe(listener: MatrixForceMessageListener): MatrixForceBinding {
    return observeForceMessage(listener)
  },
  entropy(listener: MatrixForceMessageListener): MatrixForceBinding {
    return entropyForceMessage(listener)
  },
  emit(message: MatrixForceMessage): void {
    emitForceMessage(message)
  },
  absorb(message: MatrixForceMessage): void {
    absorbForceMessage(message)
  },
  close(): void {
    closeForceChannel()
  },
}
