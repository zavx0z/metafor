import type { EnergyRuntimeSnapshot } from "./catalog.ts"
import type { EnergyMassStore } from "./mass.ts"
import type { ForceMessage } from "../force/message.ts"

export type EnergyProtocol = {
  close(): void
}

export type EnergyForce = {
  onCreate: (snapshot: unknown) => void | Promise<void>
  onImpulse: (message: ForceMessage) => void | Promise<void>
  impulse(message: ForceMessage): void
}

export type EnergyProtocolOptions = {
  force?: EnergyForce
  energyId?: string
  runtimeKind?: string
  catalog?: EnergyRuntimeSnapshot
  massStore?: EnergyMassStore
}
