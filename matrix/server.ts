import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {waitForMatrixBirthGate} from "./birth-order.ts"
import {MatrixMonad} from "./monad.ts"

const forceHealthAddress = (): URL => {
  const configured = Bun.env.FORCE_RPC_ADDRESS?.trim()
  if (configured) return new URL("health", configured.endsWith("/") ? configured : `${configured}/`)
  const address = new URL(Bun.env.FORCE_ADDRESS?.trim() || "ws://127.0.0.1:4000/ws")
  address.protocol = address.protocol === "wss:" ? "https:" : "http:"
  address.pathname = "/health"
  address.search = ""
  address.hash = ""
  return address
}

const readForceStatus = async (): Promise<Record<string, unknown>> => {
  const response = await fetch(forceHealthAddress(), {signal: AbortSignal.timeout(1_000)})
  return await response.json() as Record<string, unknown>
}

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
  await waitForMatrixBirthGate(readForceStatus)
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
