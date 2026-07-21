import {join, resolve} from "node:path"
import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {startDarkRuntime} from "./dark.ts"
import {DarkHistory} from "./history.ts"
import {DarkMonad} from "./monad.ts"

const configuredHistoryPath = Bun.env.DARK_HISTORY_PATH?.trim()
const historyPath = resolve(configuredHistoryPath || join(import.meta.dir, "..", ".metafor", "dark-history.jsonl"))
const history = new DarkHistory(historyPath)
const monad = new DarkMonad(history)
const transport = new MonadTransport("dark")
const rpc = new MonadRpcPeer(transport.channel)
monad.onServerStarted(rpc)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4002),
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
      console.error("[dark] Monad channel close failed", error)
    }
    server.stop()
  })()
  return closing
}

try {
  await transport.open({
    methods: rpc.methods(),
    endpoint: new URL("/monad/channel", server.url),
    waitMs: 30_000,
  })
  monad.onChannelOpened()
  const force = startDarkRuntime(history)
  force.onDestroy = close
} catch (error) {
  monad.onChannelFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[dark] Monad channel close failed", closeError)
  }
  console.error("[dark] Monad channel opening failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log(`[dark] listening on ${server.url} history=${historyPath}`)
