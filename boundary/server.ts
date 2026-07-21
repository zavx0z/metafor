import {mkdir} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {Force} from "shared/transport/force"
import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import {unsourceForceMessage} from "shared/protocol/force/message"
import {BoundaryMonad} from "./monad.ts"
import {open} from "./sqlite.ts"

const configuredFilename = process.argv[2]?.trim() || Bun.env.BOUNDARY_PATH?.trim()
const filename = resolve(configuredFilename || join(import.meta.dir, "..", ".metafor", "dev.sqlite"))
await mkdir(dirname(filename), {recursive: true})
const boundary = await open(filename)
const monad = new BoundaryMonad(boundary)
const transport = new MonadTransport("boundary")
const rpc = new MonadRpcPeer(transport.channel)
monad.onServerStarted(rpc)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4001),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested(filename)
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
      console.error("[boundary] Monad channel close failed", error)
    }
    server.stop()
    await boundary.close()
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

  const force = new Force("boundary")
  force.onImpulse = async (message) => {
    const part = message.parts[0]
    if (part.part === "inflaton" && part.by !== "dark") {
      console.warn(`[boundary] ignored inflaton from ${part.by ?? "unknown"}`)
      return
    }

    const commit = await boundary.materialize(message)
    if (commit) {
      for (const derived of commit.messages) force.impulse(unsourceForceMessage(derived))
      console.log(`[boundary] committed ${commit.rootSrc ?? "declaration"} impulses=${commit.messages.length}`)
    }
  }
  force.onDestroy = close
} catch (error) {
  monad.onChannelFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[boundary] Monad channel close failed", closeError)
  }
  console.error("[boundary] Monad channel opening failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log(`[boundary] listening on ${server.url} database=${filename}`)
