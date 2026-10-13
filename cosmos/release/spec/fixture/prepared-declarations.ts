import {join} from "node:path"
import {prepareQuantumRuntime, quantumRuntimeOptions, runQuantumDomain, type QuantumRuntimeSocketData} from "../../server/quantum"
import {createLocalOracleChannelPair} from "../../../../quantum/dark/oracle/local"
import {OracleRpcPeer} from "shared/transport/oracle"
import {READ_GRAPH_METHOD, type Graph} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD} from "shared/protocol/metafor/observation"

if (Bun.env.COSMOS_QUANTUM_DOMAIN) {
  await runQuantumDomain(Bun.env.COSMOS_QUANTUM_DOMAIN)
} else {
  const directory = Bun.env.PREPARED_FIXTURE_ROOT!
  const local = createLocalOracleChannelPair("prepared-fixture", () => []), peer = new OracleRpcPeer(local.peer)
  let sourceReads = 0
  const old = async (source: string): Promise<MetaDSL> => {sourceReads++; return (await Bun.file(join(directory, "old.json")).json())[source]}
  const next = async (source: string): Promise<MetaDSL> => (await Bun.file(join(directory, "next.json")).json())[source]
  const quantum = await prepareQuantumRuntime({...quantumRuntimeOptions(join(directory, "state"))!, executable: process.argv[1]!, localOracleChannels: [local.router], readyTimeoutMs: 15000,
    root: async () => ({source: "@metafor/agent", readMeta: old})})
  const server = Bun.serve<QuantumRuntimeSocketData>({port: 0, hostname: "127.0.0.1", fetch: (request, current) => quantum.fetch(request, current), websocket: quantum.websocket})
  const graph = () => peer.call<Graph>("dark", READ_GRAPH_METHOD, {})
  const history = () => peer.call<{frontier: {cutId: string; throughSequence: number}}>("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
  const chat = (value: Graph) => value.runtime.roots[0]!.children!.find((node): node is Extract<typeof node, {kind: "atom"}> => node.kind === "atom" && node.meta === "@metafor/chat")!
  const mass = async (value: Graph) => {
    const node = chat(value)
    return await peer.call("energy", ENERGY_MASS_RESULT_READ_METHOD, {contractVersion: 1, atom: {root: value.root, ref: node.ref, meta: "@metafor/chat"}, key: "session", maxBytes: 100000})
  }
  const initialization = await quantum.start(server.port!)
  let current: Graph
  const deadline = Date.now() + 10000
  do {current = await graph(); if (chat(current).values.ready === true) break; if (Date.now() > deadline) throw new Error("Old Chat Mass did not initialize"); await Bun.sleep(10)} while (true)
  process.send?.({kind: "ready", initialization, sourceReads, graph: current, mass: await mass(current)})
  let closing = false
  process.on("message", message => {
    if (message === "stop") void (async () => {if (closing) return; closing = true; peer.close(); await quantum.close(); await local.peer.close(); await server.stop(true); process.send?.({kind: "closed"}); process.disconnect?.()})()
    if (message === "activate") void (async () => {
      const before = await graph(), atom = before.runtime.roots[0]!
      if (atom.kind !== "atom") throw new Error("Fixture root is not an Atom")
      await peer.call("dark", META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: before.root, ref: atom.ref, meta: atom.meta}, field: "title", value: "human retained", expectedFrontier: (await history()).frontier})
      const held = await peer.call<{snapshot: {identity: {frontier: {cutId: string; throughSequence: number}}}}>("dark", "readGraphDelta", {contractVersion: 1, base: null})
      const expectedFrontier = held.snapshot.identity.frontier
      const request = {operationId: "compiled-upgrade", releaseDigest: "a".repeat(64), root: "@metafor/agent", expectedFrontier, readMeta: next}
      const receipt = await quantum.dark.applyPreparedDeclarations(request)
      const repeat = await quantum.dark.applyPreparedDeclarations(request)
      const after = await graph(), frontier = (await history()).frontier
      let rejection = ""
      try {await quantum.dark.applyPreparedDeclarations({...request, operationId: "bad-reorder", expectedFrontier: frontier, readMeta: async source => {
        const dsl = await next(source)
        return source === "@metafor/agent" ? {...dsl, fields: [dsl.fields[1]!, dsl.fields[0]!, ...dsl.fields.slice(2)]} : dsl
      }})} catch (error) {rejection = error instanceof Error ? error.message : String(error)}
      const preservedMass = await mass(after), afterRejection = (await history()).frontier
      const child = chat(after)
      await peer.call("dark", META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: {root: after.root, ref: child.ref, meta: "@metafor/chat"}, field: "feedbackRequest", value: "observed annotation", expectedFrontier: afterRejection})
      const deadline = Date.now() + 10000
      let final: Graph
      do {final = await graph(); if (chat(final).values.feedbackSeen === true && chat(final).state === "idle") break; if (Date.now() > deadline) throw new Error("New prepared Process did not execute"); await Bun.sleep(10)} while (true)
      process.send?.({kind: "activated", receipt, repeat, graph: final, mass: preservedMass, feedbackMass: await mass(final), rejection, frontier, afterRejection})
    })().catch(error => process.send?.({kind: "failed", error: error instanceof Error ? error.stack : String(error)}))
  })
}
