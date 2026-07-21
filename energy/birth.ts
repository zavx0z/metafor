import type {EnergyProtocol, EnergyProtocolOptions} from "@metafor/types/energy/protocol"
import type {MonadRpcPeer} from "shared/transport/monad"
import {startEnergyProtocol} from "./energy.ts"
import {EnergyMonad} from "./monad.ts"

export type EnergyRuntimeForce = NonNullable<EnergyProtocolOptions["force"]> & {
  readonly connected: boolean
  onConnectionChange: (connected: boolean) => void
  onDestroy?: () => void | Promise<void>
}

export type EnergyRuntimeBirth = {
  force: EnergyRuntimeForce
  protocol: EnergyProtocol
  summary: {
    atoms: number
    topologies: number
    fields: number
    variants: number
    processes: number
    continuations: number
  }
}

/**
 * Opens the Energy Monad channel, hydrates canonical data, and only then creates
 * the mandatory ForceChannel. No bootstrap data is carried through Force.
 */
export async function birthEnergyRuntime(options: {
  monad: EnergyMonad
  peer: Pick<MonadRpcPeer, "call">
  openMonad(): Promise<unknown>
  createForce(): EnergyRuntimeForce
  protocol?: Omit<EnergyProtocolOptions, "force">
  onBorn?(summary: EnergyRuntimeBirth["summary"]): void
}): Promise<EnergyRuntimeBirth> {
  await options.openMonad()
  const summary = await options.monad.onServerStarted(options.peer)
  const force = options.createForce()
  const protocol = startEnergyProtocol({
    ...options.protocol,
    force,
    catalog: options.monad.catalog,
  })
  let runtimeBorn = false
  force.onConnectionChange = (connected) => {
    if (!connected || runtimeBorn) return
    runtimeBorn = true
    options.monad.onRuntimeBorn()
    options.onBorn?.(summary)
  }
  return {force, protocol, summary}
}
