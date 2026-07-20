import {MonadRpcClient} from "shared/transport/monad"
import {MatrixMonad} from "./monad.ts"

const monad = new MatrixMonad()

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4003),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested()
      },
    },
  },
})

try {
  const summary = await monad.onServerStarted(new MonadRpcClient("matrix"))
  await import("./matrix.ts")
  monad.onRuntimeBorn()
  console.log(`[matrix] born atoms=${summary.atoms} fields=${summary.fields} backend=${summary.backend}`)
} catch (error) {
  monad.onRuntimeBirthFailed(error)
  console.error("[matrix] Monad birth failed", error)
}

console.log(`[matrix] listening on ${server.url}`)
