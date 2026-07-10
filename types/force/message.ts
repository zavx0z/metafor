import type { Particle } from "./particle.ts"

export interface ForceMessage {
  parts: [Particle]
}
