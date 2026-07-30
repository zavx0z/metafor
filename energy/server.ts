import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {birthEnergyRuntime, type EnergyRuntimeBirth} from "./birth.ts"
import {EnergyMonad} from "./monad.ts"

const monad = new EnergyMonad()
const transport = new MonadTransport("energy")
const rpc = new MonadRpcPeer(transport.channel)
monad.onServerStarting(rpc)
const checkpoint = installForceCheckpointSideband("energy", rpc)
let runtime: EnergyRuntimeBirth | null = null

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4005),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested()
      },
    },
    "/monad/channel": {
      POST(request) {
        return transport.receive(request)
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
    openMonad: async () => {
      const opened = await transport.open({
        methods: rpc.methods(),
        endpoint: new URL("/monad/channel", server.url),
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
