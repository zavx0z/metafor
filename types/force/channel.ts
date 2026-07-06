import type { ForceMessage, ForceMessageListener } from "./message.ts"
import type { ForcePartInput, PhotonPayload } from "./particle.ts"
import type { DarkGluonPatchPart, DarkHiggsPatchPart } from "./fields.ts"

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

export interface DarkGravityForce {
  emitParts(parts: ForcePartInput[]): void
  emitAdd(wimpId: string): void
  emitRemove(wimpId: string): void
  emitBarrier(value?: null | "" | Record<string, never>): void
  close(): void
}

export interface DarkPhotonStore {
  messages: PhotonPayload[]
}

export interface DarkPhotonSubscription {
  close(): void
}

export interface DarkElectromagnetismForce {
  emitGluonParts(parts: DarkGluonPatchPart[]): void
  emitHiggsParts(parts: DarkHiggsPatchPart[]): void
  emitGluonReplace(actorId: number, fieldId: number, value: unknown): void
  emitHiggsReplace(path: number | string, fieldId: number, value: unknown): void
  close(): void
}
