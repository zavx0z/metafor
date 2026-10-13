import {CODESPACE_HOST, CODESPACE_META, CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, validCodespaceRequestId} from "@metafor/types/metafor/codespace"
import {READ_GRAPH_METHOD, validateGraph, type RuntimeNode} from "@metafor/types/metafor/graph"
import {OracleRpcPeer} from "shared/transport/oracle"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {createCodespaceHostAdapter, readCodespaceHostAssignment, type CodespaceHostAssignment, type CodespaceHostRunner} from "./codespace-host"

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/**
Adds a host service to the same native local Oracle channel composition.
Only Energy can forward a bound exact Tool actor; that actor is rechecked in
ordinary public Graph before any external operation. No browser gh endpoint
or private domain access is installed. See [Tool law](../../../standard/codespace/README.md).
*/
export function createCodespaceHostOracle(options: {
  assignment: CodespaceHostAssignment
  run?: CodespaceHostRunner
  admitted?: () => boolean
}) {
  let methods: readonly string[] = []
  const local = createLocalOracleChannelPair(CODESPACE_HOST, () => methods)
  const peer = new OracleRpcPeer(local.peer)
  const adapter = createCodespaceHostAdapter(options.assignment, options.run)
  let closed = false
  const verify = async (params: unknown, source: string, start: boolean) => {
    if (closed || options.admitted?.() === false) throw new Error("Codespace host is not admitted")
    if (source !== "energy" || !record(params) || Object.keys(params).sort().join(",") !== (start ? "actor,requestId" : "actor") ||
        !record(params.actor) || Object.keys(params.actor).sort().join(",") !== "meta,ref,root" ||
        params.actor.meta !== CODESPACE_META || typeof params.actor.ref !== "string" || typeof params.actor.root !== "string" ||
        start && !validCodespaceRequestId(params.requestId)) throw new Error("Codespace host requires a bound Tool actor")
    const actor = params.actor
    const observed = validateGraph(await peer.call("dark", READ_GRAPH_METHOD, {}))
    if (!observed.ok || observed.value.root !== actor.root) throw new Error("Codespace Tool scope is unavailable")
    const nodes: RuntimeNode[] = [...observed.value.runtime.roots]
    let found = false
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!
      if (node.kind === "atom" && node.ref === actor.ref && node.meta === actor.meta) found = true
      nodes.push(...(node.children ?? []))
    }
    if (!found || closed || options.admitted?.() === false) throw new Error("Codespace Tool actor is absent or no longer admitted")
  }
  peer.expose(CODESPACE_STATUS_METHOD, async (params, context) => {
    await verify(params, context.source, false)
    return await adapter.execute("status")
  })
  peer.expose(CODESPACE_START_METHOD, async (params, context) => {
    await verify(params, context.source, true)
    return await adapter.execute("start")
  })
  methods = peer.methods()
  let closing: Promise<void> | undefined
  return {channel: local.router, close() {
    return closing ??= (async () => {closed = true; adapter.close(); peer.close(); await local.peer.close(); await local.router.close()})()
  }}
}

/** Native deployment config is private to the host and never enters domain environments. */
export function configuredCodespaceHostOracle(environment: Readonly<Record<string, string | undefined>>, admitted: () => boolean) {
  const assignment = readCodespaceHostAssignment(environment)
  return assignment ? createCodespaceHostOracle({assignment, admitted}) : null
}
