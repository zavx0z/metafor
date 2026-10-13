/** Isolated compiled native Quantum contour. Test control uses only owned IPC and public Oracle methods. */
import {join} from "node:path"
import {prepareQuantumRuntime, runQuantumDomain, type QuantumRuntimeSocketData} from "../../../../cosmos/release/server/quantum"
import {createLocalOracleChannelPair} from "../../../../quantum/dark/oracle/local"
import {OracleRpcPeer} from "shared/transport/oracle"
import {READ_GRAPH_METHOD} from "@metafor/types/metafor/graph"
import {READ_AGENTS_METHOD} from "@metafor/types/metafor/agent-observation"
import {DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, META_PROCESS_EXECUTION_READ_METHOD} from "shared/protocol/metafor/observation"

const domain = Bun.env.COSMOS_QUANTUM_DOMAIN
if (domain) {
  await runQuantumDomain(domain)
  await Bun.write(join(process.cwd(), `agent-fixture-${domain}.json`), JSON.stringify({domain, pid: process.pid}))
} else {
  const stateRoot = Bun.env.ORACLE_ENVIRONMENT_FIXTURE_STATE
  if (!stateRoot) throw new Error("Fixture requires its private state directory")
  const local = createLocalOracleChannelPair("installed-agent-acceptance", () => [])
  const peer = new OracleRpcPeer(local.peer)
  let rootReads = 0
  const quantum = await prepareQuantumRuntime({stateRoot, transport: "peer", executable: process.argv[1]!, readyTimeoutMs: 30_000,
    localOracleChannels: [local.router],
    root: async () => {rootReads++; return {source: "@metafor/environment"}},
    initialRootFields: {
      providerBinding: "legacy-codex",
      providerBootstrap: JSON.stringify([{id: "legacy-codex", service: "codex", host: "native", remotePeerId: "native", executorId: "codex",
        source: {kind: "native-bootstrap", assignmentId: "legacy-codex", remoteGraph: "unknown"}, resolution: "exact", connection: "unknown",
        capabilities: {modelTurn: true, browserPreview: false, browserControl: false}, checks: {status: "unknown", checkedAt: null, message: null}}]),
    },
    energyEnvironment: {
      ORACLE_ENVIRONMENT_GRAPH_SCOPES: "@metafor/agent,@metafor/scenario,@metafor/provider",
      ORACLE_AGENT_CODEX_COMMAND: Bun.env.ORACLE_AGENT_CODEX_COMMAND,
      ORACLE_AGENT_CODEX_CWD: Bun.env.ORACLE_AGENT_CODEX_CWD,
      ORACLE_AGENT_FIXTURE_STORE: Bun.env.ORACLE_AGENT_FIXTURE_STORE,
      ORACLE_AGENT_FIXTURE_REPLY_FILE: Bun.env.ORACLE_AGENT_FIXTURE_REPLY_FILE,
    },
  })
  const server = Bun.serve<QuantumRuntimeSocketData>({hostname: "127.0.0.1", port: 0,
    fetch: (request, current) => quantum.fetch(request, current), websocket: quantum.websocket})
  const allowed = new Map<string, ReadonlySet<string>>([
    ["dark", new Set([READ_GRAPH_METHOD, READ_AGENTS_METHOD, DARK_FORCE_HISTORY_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, META_PROCESS_EXECUTION_READ_METHOD])],
    ["energy", new Set([ENERGY_MASS_RESULT_READ_METHOD])],
  ])
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    try {await quantum.dark.quiesce()}
    finally {
      try {await quantum.close()}
      finally {
        peer.close()
        await local.peer.close()
        await server.stop(true)
        process.send?.({type: "closed"})
        process.disconnect?.()
      }
    }
  })()
  process.on("message", message => {
    if (!message || typeof message !== "object" || !("type" in message)) return
    if (message.type === "close") {void close().catch(error => {console.error(error); process.exitCode = 1}); return}
    if (message.type !== "oracle" || !("id" in message) || typeof message.id !== "string") return
    const id = message.id
    void (async () => {
      if (closing || !("target" in message) || typeof message.target !== "string" || !("method" in message)
        || typeof message.method !== "string" || !allowed.get(message.target)?.has(message.method) || !("input" in message))
        throw new Error("Fixture permits only the declared public Oracle reads and Field intent")
      const result = await peer.call(message.target, message.method, message.input)
      process.send?.({type: "response", id, ok: true, result})
    })().catch(error => process.send?.({type: "response", id, ok: false, error: error instanceof Error ? error.message : String(error)}))
  })
  process.once("SIGTERM", () => {void close().catch(error => {console.error(error); process.exitCode = 1})})
  process.once("SIGINT", () => {void close().catch(error => {console.error(error); process.exitCode = 1})})
  process.once("disconnect", () => {void close().catch(() => {process.exitCode = 1})})
  void quantum.failure.catch(async error => {
    console.error(error)
    try {await close()} catch {}
    process.exitCode = 1
  })
  try {
    const initialization = await quantum.start(server.port!)
    const children = await Promise.all(["boundary", "energy", "matrix"].map(async name => {
      const file = Bun.file(join(stateRoot, `agent-fixture-${name}.json`))
      const deadline = Date.now() + 5000
      while (!await file.exists()) {
        if (Date.now() > deadline) throw new Error(`Missing native domain evidence: ${name}`)
        await Bun.sleep(10)
      }
      return await file.json()
    }))
    process.send?.({type: "ready", initialization, rootReads, children, graph: await peer.call("dark", READ_GRAPH_METHOD, {})})
  } catch (error) {
    console.error(error)
    try {await close()} catch {}
    process.exitCode = 1
  }
}
