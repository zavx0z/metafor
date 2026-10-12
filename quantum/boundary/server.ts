import {mkdir} from "node:fs/promises"
import {dirname, resolve} from "node:path"
import type {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {DOMAIN_HEALTH_READ_METHOD} from "shared/protocol/oracle/health"
import {OracleRpcPeer, type OracleWebSocketTransport} from "shared/transport/oracle"
import {unsourceForceMessage} from "shared/protocol/force/message"
import {BoundaryOracle} from "./oracle.ts"
import {open} from "./sqlite.ts"

/** Opens the owning Boundary projection before creating its injected causal Force port. */
export async function startBoundaryRuntime(options: {
  filename: string
  transport: Pick<OracleWebSocketTransport, "channel" | "open" | "close">
  createForce(): Pick<Force, "onImpulse" | "onDestroy" | "onImpulseError" | "impulse">
}) {
  const filename = resolve(options.filename)
  await mkdir(dirname(filename), {recursive: true})
  const boundary = await open(filename)
  const oracle = new BoundaryOracle(boundary)
  const transport = options.transport
  const rpc = new OracleRpcPeer(transport.channel)
  oracle.onServerStarted(rpc)
  rpc.expose(DOMAIN_HEALTH_READ_METHOD, () => oracle.health(filename))
  const checkpoint = installForceCheckpointSideband("boundary", rpc)

  let closing: Promise<void> | null = null
  const close = (): Promise<void> => {
    if (closing) return closing
    closing = (async () => {
      oracle.onServerStopping()
      rpc.close()
      try {
        await transport.close()
      } catch (error) {
        console.error("[boundary] Oracle channel close failed", error)
      }
      await boundary.close()
    })()
    return closing
  }

  try {
    await transport.open({
      methods: rpc.methods(),
      waitMs: 30_000,
    })
    await checkpoint.open()
    oracle.onChannelOpened()

    const force = options.createForce()
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
    oracle.onChannelFailed(error)
    try {
      await transport.close()
    } catch (closeError) {
      console.error("[boundary] Oracle channel close failed", closeError)
    }
    console.error("[boundary] Oracle channel opening failed", error)
    await close()
    throw error
  }

  console.log(`[boundary] connected to Dark database=${filename}`)
  return {close}
}
