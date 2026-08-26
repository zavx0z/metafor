import type { EnergyMassStore } from "./mass.ts"
import type {EnergyRuntimeStore} from "./energy.ts"
import type {ForceMessage} from "shared/protocol/force/message"

export type EnergyProtocol = {
  /** Waits only for already-started local Process/Reaction/finalizer work. */
  quiesce(): Promise<void>
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
  energyStore?: EnergyRuntimeStore
  /** Fatal domain invariant failure, distinct from a failed user Process/Reaction. */
  onFatal?(error: Error): void | Promise<void>
}
