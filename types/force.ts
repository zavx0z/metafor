export type Part = "graviton" | "photon" | "gluon" | "higgs" | "w+" | "w-" | "z"

export type ParticleOperation = "add" | "remove" | "replace" | "move" | "copy" | "test"

export interface Particle {
  part: Part
  op: ParticleOperation
  path: string | number
  value?: unknown
  from?: string | number
  [key: string]: unknown
}

export interface ForceMessage {
  parts: Particle[]
}

export interface PhotonPayload {
  value: string
  path: string | number
}

export interface ForceMessageListener {
  (this: BroadcastChannel, ev: MessageEvent<ForceMessage>): unknown
}

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

export interface ForceChannel extends Omit<BroadcastChannel, "onmessage" | "postMessage"> {
  onmessage: ((this: BroadcastChannel, ev: MessageEvent<ForceMessage>) => unknown) | null
  postMessage(message: ForceMessage): void
}
