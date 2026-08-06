import {DOMAIN_HEALTH_READ_METHOD} from "shared/protocol/monad/health"
import {MonadRpcPeer, MonadWebSocketTransport} from "shared/transport/monad"
import {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {birthEnergyRuntime, type EnergyRuntimeBirth} from "./birth.ts"
import {EnergyMonad} from "./monad.ts"

const monad = new EnergyMonad()
const transport = new MonadWebSocketTransport("energy")
const rpc = new MonadRpcPeer(transport.channel)
monad.onServerStarting(rpc)
rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => monad.health())
const checkpoint = installForceCheckpointSideband("energy", rpc)
let runtime: EnergyRuntimeBirth | null = null
console.log("[energy] connecting to Dark")

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    monad.onServerStopping()
    runtime?.protocol.close()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[energy] Monad channel close failed", error)
    }
  })()
  return closing
}

try {
  runtime = await birthEnergyRuntime({
    monad,
    peer: rpc,
    openMonad: async () => {
      const opened = await transport.open({
        methods: rpc.methods(),
        waitMs: 30_000,
      })
      await checkpoint.open()
      return opened
    },
    createForce: () => new Force("energy"),
    protocol: {massStore: monad.massStore},
    onBorn(summary) {
      console.log(
        `[energy] born atoms=${summary.atoms} topologies=${summary.topologies} ` +
        `fields=${summary.fields} variants=${summary.variants} ` +
        `processes=${summary.processes} continuations=${summary.continuations}`,
      )
    },
  })
  checkpoint.bindQuiescence(async () => await runtime?.protocol.quiesce())
  runtime.force.onDestroy = close
} catch (error) {
  monad.onRuntimeBirthFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[energy] Monad channel close failed", closeError)
  }
  console.error("[energy] Monad birth failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)
