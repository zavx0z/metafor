import type { Particle } from "./particle.ts"

export interface ForceMessage {
  parts: Particle[]
}

export interface ForceMessageListener {
  (this: BroadcastChannel, ev: MessageEvent<ForceMessage>): unknown
}
