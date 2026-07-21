import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {Force} from "shared/transport/force"
import {birthEnergyRuntime, type EnergyRuntimeBirth} from "./birth.ts"
import {EnergyMonad} from "./monad.ts"

const monad = new EnergyMonad()
const transport = new MonadTransport("energy")
const rpc = new MonadRpcPeer(transport.channel)
let runtime: EnergyRuntimeBirth | null = null

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4005),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested()
      },
    },
  },
})

console.log(`[energy] listening on ${server.url}`)

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
    server.stop()
  })()
  return closing
}

try {
  runtime = await birthEnergyRuntime({
    monad,
    peer: rpc,
    openMonad: async () => await transport.open({waitMs: 30_000}),
    createForce: () => new Force("energy"),
    onBorn(summary) {
      console.log(
        `[energy] born atoms=${summary.atoms} topologies=${summary.topologies} ` +
        `fields=${summary.fields} variants=${summary.variants} ` +
        `processes=${summary.processes} continuations=${summary.continuations}`,
      )
    },
  })
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
