import {
  DARK_FORCE_STATUS_READ_METHOD,
  DOMAIN_HEALTH_READ_METHOD,
  type DarkForceStatus,
} from "shared/protocol/oracle/health"
import {OracleRpcPeer, OracleWebSocketTransport} from "shared/transport/oracle"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {waitForMatrixBirthGate} from "./birth-order.ts"
import {MatrixOracle} from "./oracle.ts"

const oracle = new MatrixOracle()
const transport = new OracleWebSocketTransport("matrix")
const rpc = new OracleRpcPeer(transport.channel)
rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => oracle.health())
const checkpoint = installForceCheckpointSideband("matrix", rpc)

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    oracle.onServerStopping()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[matrix] Oracle channel close failed", error)
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
  const summary = await oracle.onServerStarted(rpc)
  await import("./matrix.ts")
  oracle.onRuntimeBorn()
  console.log(`[matrix] born atoms=${summary.atoms} fields=${summary.fields} backend=${summary.backend}`)
} catch (error) {
  oracle.onRuntimeBirthFailed(error)
  console.error("[matrix] Oracle birth failed", error)
  await close()
  throw error
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log("[matrix] connected to Dark")
