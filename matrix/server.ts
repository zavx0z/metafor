import {
  DARK_FORCE_STATUS_READ_METHOD,
  DOMAIN_HEALTH_READ_METHOD,
  type DarkForceStatus,
} from "shared/protocol/monad/health"
import {MonadRpcPeer, MonadWebSocketTransport} from "shared/transport/monad"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {waitForMatrixBirthGate} from "./birth-order.ts"
import {MatrixMonad} from "./monad.ts"

const monad = new MatrixMonad()
const transport = new MonadWebSocketTransport("matrix")
const rpc = new MonadRpcPeer(transport.channel)
rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => monad.health())
const checkpoint = installForceCheckpointSideband("matrix", rpc)

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
  })()
  return closing
}

try {
  await transport.open({
    methods: rpc.methods(),
    waitMs: 30_000,
  })
  await checkpoint.open()
  await waitForMatrixBirthGate(async () =>
    await rpc.call<DarkForceStatus>("dark", DARK_FORCE_STATUS_READ_METHOD, {}))
  const summary = await monad.onServerStarted(rpc)
  await import("./matrix.ts")
  monad.onRuntimeBorn()
  console.log(`[matrix] born atoms=${summary.atoms} fields=${summary.fields} backend=${summary.backend}`)
} catch (error) {
  monad.onRuntimeBirthFailed(error)
  console.error("[matrix] Monad birth failed", error)
  await close()
  throw error
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log("[matrix] connected to Dark")
