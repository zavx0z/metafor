import type { EnergyRuntimeSnapshot } from "./catalog.ts"
import type { EnergyMassStore } from "./mass.ts"

export type EnergyProtocol = {
  close(): void
}

export type EnergyProtocolOptions = {
  force?: BroadcastChannel
  energyId?: string
  timeoutMs?: number
  runtimeKind?: string
  catalog?: EnergyRuntimeSnapshot
  massStore?: EnergyMassStore
}
