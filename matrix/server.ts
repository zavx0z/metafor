import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {MatrixMonad} from "./monad.ts"

const monad = new MatrixMonad()
const transport = new MonadTransport("matrix")
const rpc = new MonadRpcPeer(transport.channel)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4003),
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

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    monad.onServerStopping()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[matrix] Monad channel close failed", error)
    }
    server.stop()
  })()
  return closing
}

try {
  await transport.open({waitMs: 30_000})
  const summary = await monad.onServerStarted(rpc)
  await import("./matrix.ts")
  monad.onRuntimeBorn()
  console.log(`[matrix] born atoms=${summary.atoms} fields=${summary.fields} backend=${summary.backend}`)
} catch (error) {
  monad.onRuntimeBirthFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[matrix] Monad channel close failed", closeError)
  }
  console.error("[matrix] Monad birth failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log(`[matrix] listening on ${server.url}`)
