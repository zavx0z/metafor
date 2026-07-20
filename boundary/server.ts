import {mkdir} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {Force} from "shared/transport/force"
import {MonadRpcClient} from "shared/transport/monad"
import {unsourceForceMessage} from "shared/protocol/force/message"
import {BoundaryMonad} from "./monad.ts"
import {open} from "./sqlite.ts"

const configuredFilename = process.argv[2]?.trim() || Bun.env.BOUNDARY_PATH?.trim()
const filename = resolve(configuredFilename || join(import.meta.dir, "..", ".metafor", "dev.sqlite"))
await mkdir(dirname(filename), {recursive: true})
const boundary = await open(filename)
const monad = new BoundaryMonad(boundary)

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4001),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested(filename)
      },
    },
    "/monad/rpc": {
      POST(request) {
        return monad.onRpcRequested(request)
      },
    },
  },
})

const close = async (): Promise<void> => {
  monad.onServerStopping()
  server.stop()
  await boundary.close()
}

try {
  const rpc = new MonadRpcClient("boundary")
  await monad.onServerStarted(rpc, new URL("/monad/rpc", server.url))

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
  console.error("[boundary] Monad RPC registration failed", error)
}

console.log(`[boundary] listening on ${server.url} database=${filename}`)
