import {DOMAIN_HEALTH_READ_METHOD} from "shared/protocol/oracle/health"
import {OracleRpcPeer, OracleWebSocketTransport} from "shared/transport/oracle"
import {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {birthEnergyRuntime, type EnergyRuntimeBirth} from "./birth.ts"
import {EnergyOracle} from "./oracle.ts"

const oracle = new EnergyOracle()
const transport = new OracleWebSocketTransport("energy")
const rpc = new OracleRpcPeer(transport.channel)
oracle.onServerStarting(rpc)
rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => oracle.health())
const checkpoint = installForceCheckpointSideband("energy", rpc)
let runtime: EnergyRuntimeBirth | null = null
console.log("[energy] connecting to Dark")

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    oracle.onServerStopping()
    runtime?.protocol.close()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[energy] Oracle channel close failed", error)
    }
  })()
  return closing
}

try {
  runtime = await birthEnergyRuntime({
    oracle,
    peer: rpc,
    openOracle: async () => {
      const opened = await transport.open({
        methods: rpc.methods(),
        waitMs: 30_000,
      })
      await checkpoint.open()
      return opened
    },
    createForce: () => new Force("energy"),
    protocol: {
      massStore: oracle.massStore,
      onFatal(error) {
        oracle.onRuntimeBirthFailed(error)
        console.error("[energy] fatal runtime invariant", error)
        void close().finally(() => process.exit(1))
      },
    },
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
  oracle.onRuntimeBirthFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[energy] Oracle channel close failed", closeError)
  }
  console.error("[energy] Oracle birth failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)
