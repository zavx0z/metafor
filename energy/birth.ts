import type {EnergyProtocol, EnergyProtocolOptions} from "@metafor/types/energy/protocol"
import type {OracleRpcPeer} from "shared/transport/oracle"
import {startEnergyProtocol} from "./energy.ts"
import {EnergyOracle} from "./oracle.ts"

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
 * Opens the Energy Oracle channel, hydrates canonical data, and only then creates
 * the mandatory ForceChannel. No bootstrap data is carried through Force.
 */
export async function birthEnergyRuntime(options: {
  oracle: EnergyOracle
  peer: Pick<OracleRpcPeer, "call">
  openOracle(): Promise<unknown>
  createForce(): EnergyRuntimeForce
  protocol?: Omit<EnergyProtocolOptions, "force">
  onBorn?(summary: EnergyRuntimeBirth["summary"]): void
}): Promise<EnergyRuntimeBirth> {
  await options.openOracle()
  const summary = await options.oracle.onServerStarted(options.peer)
  const force = options.createForce()
  const protocol = startEnergyProtocol({
    ...options.protocol,
    force,
    catalog: options.oracle.catalog,
  })
  let runtimeBorn = false
  force.onConnectionChange = (connected) => {
    if (!connected || runtimeBorn) return
    runtimeBorn = true
    options.oracle.onRuntimeBorn()
    options.onBorn?.(summary)
  }
  return {force, protocol, summary}
}
