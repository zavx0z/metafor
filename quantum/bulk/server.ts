import {
  BULK_BROWSER_INITIAL_METHOD,
  BULK_BROWSER_MESSAGE_METHOD,
  DARK_BULK_BROWSER_BROADCAST_METHOD,
  readBulkBrowserInitialRequest,
  readBulkBrowserMessageRequest,
} from "@metafor/types/bulk/browser"
import {DOMAIN_HEALTH_READ_METHOD} from "shared/protocol/oracle/health"
import {unsourceForceMessage} from "shared/protocol/force/message"
import {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {OracleRpcPeer, OracleWebSocketTransport} from "shared/transport/oracle"
import {routeBulkBrowserPayload} from "./browser-protocol.ts"
import {BulkOracle} from "./oracle.ts"
import {bulkStoreApplyControl} from "./store-initial.ts"

const oracle = new BulkOracle()
const transport = new OracleWebSocketTransport("bulk")
const rpc = new OracleRpcPeer(transport.channel)
oracle.onServerStarting(rpc)
rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => oracle.health())
const checkpoint = installForceCheckpointSideband("bulk", rpc)
let force: Force | null = null

rpc.expose(BULK_BROWSER_INITIAL_METHOD, async (params, context) => {
  if (context.source !== "dark") {
    throw new Error("Bulk browser initial is available only through Dark")
  }
  const request = readBulkBrowserInitialRequest(params)
  if (request === null) throw new Error("Bulk browser initial request is invalid")
  return await oracle.openFreshObserver(rpc, request.session)
})

rpc.expose(BULK_BROWSER_MESSAGE_METHOD, (params, context) => {
  if (context.source !== "dark") {
    throw new Error("Bulk browser messages are accepted only through Dark")
  }
  const request = readBulkBrowserMessageRequest(params)
  if (request === null) return "invalid"
  return routeBulkBrowserPayload(request.message, {
    consumeControl: () => false,
    onImpulse(message) {
      console.log(`[bulk] browser -> force part=${message.parts[0].part}`)
      force?.impulse(unsourceForceMessage(message))
    },
  })
})

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    oracle.onServerStopping()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[bulk] Oracle channel close failed", error)
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
  await oracle.onServerStarted(rpc)
  force = new Force("bulk")
  force.onImpulse = async (impulse) => {
    oracle.acceptImpulse(impulse)
    const update = bulkStoreApplyControl(impulse)
    if (update === null) {
      console.log("[bulk] <- force excluded=bulk/view_css")
      return
    }
    await rpc.call("dark", DARK_BULK_BROWSER_BROADCAST_METHOD, update)
    console.log(`[bulk] <- force part=${impulse.parts[0].part}`)
  }
  let runtimeBorn = false
  force.onConnectionChange = (connected) => {
    if (!connected || runtimeBorn) return
    runtimeBorn = true
    oracle.onRuntimeBorn()
    console.log("[bulk] born graph=request-local")
  }
  force.onDestroy = close
} catch (error) {
  oracle.onRuntimeBirthFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[bulk] Oracle channel close failed", closeError)
  }
  console.error("[bulk] Oracle birth failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)

console.log("[bulk] connected to Dark")
