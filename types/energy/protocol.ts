import type { EnergyMassStore } from "./mass.ts"
import type { ForceMessage } from "../force/message.ts"

export type EnergyProtocol = {
  close(): void
}

export type EnergyForce = {
  onImpulse: (message: ForceMessage) => void | Promise<void>
  impulse(message: ForceMessage): void
}

export type EnergyProtocolOptions = {
  force?: EnergyForce
  energyId?: string
  runtimeKind?: string
  massStore?: EnergyMassStore
}
