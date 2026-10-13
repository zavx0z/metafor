import type {Force} from "shared/transport/force"
import {
  DARK_FORCE_STATUS_READ_METHOD,
  DOMAIN_HEALTH_READ_METHOD,
  type DarkForceStatus,
} from "shared/protocol/oracle/health"
import {OracleRpcPeer, type OracleWebSocketTransport} from "shared/transport/oracle"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {waitForMatrixBirthGate} from "./birth-order.ts"
import {DARK_FORCE_HISTORY_READ_METHOD, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"
import {proveMatrixStatePublication} from "./state-proof"
import {MatrixOracle} from "./oracle.ts"

/** Matrix hydrates its projection before explicitly creating the causal Force port. */
export async function startMatrixRuntime(options: {
  transport: Pick<OracleWebSocketTransport, "channel" | "open" | "close">
  createForce(): Pick<Force, "onImpulse" | "onImpulseError" | "impulse">
}) {
  const oracle = new MatrixOracle()
  const transport = options.transport
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
      await rpc.call<DarkForceStatus>("dark", DARK_FORCE_STATUS_READ_METHOD, {}), {
        ...(Bun.env.METAFOR_DOMAINS ? {requiredDomains: Bun.env.METAFOR_DOMAINS.split(",").filter(domain => domain !== "matrix") as ("dark" | "boundary" | "energy" | "bulk")[]} : {}),
      })
    const summary = await oracle.onServerStarted(rpc)
    const matrix = await import("./matrix.ts")
    const birthHistory = await rpc.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
    if (birthHistory.contractVersion !== 1 || birthHistory.resolution !== "exact" || birthHistory.frontier.cutId !== checkpoint.frontier()?.cutId) throw new Error("Matrix birth history and checkpoint cut differ")
    await matrix.startMatrixForce(options.createForce, {recoverStatePublication: event => proveMatrixStatePublication(rpc, birthHistory.frontier, event)})
    oracle.onRuntimeBorn()
    console.log(`[matrix] born atoms=${summary.atoms} fields=${summary.fields} backend=${summary.backend}`)
  } catch (error) {
    oracle.onRuntimeBirthFailed(error)
    console.error("[matrix] Oracle birth failed", error)
    await close()
    throw error
  }

  console.log("[matrix] connected to Dark")
  return {close}
}
