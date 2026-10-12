import {dirname, join} from "node:path"
import {prepareQuantumRuntime, quantumRuntimeOptions, runQuantumDomain} from "../../server/quantum"
import type {QuantumRuntimeSocketData} from "../../server/quantum"
import {createLocalOracleChannelPair} from "../../../../quantum/dark/oracle/local"
import {READ_GRAPH_METHOD} from "@metafor/types/metafor/graph"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {DARK_FORCE_PAUSE_METHOD, DARK_FORCE_RESUME_METHOD, DARK_FORCE_STACK_METHOD} from "../../../../quantum/dark/oracle"
import {EnergyMassCatalog} from "../../../../quantum/energy/mass"
import {MassCatalog} from "../../../../shared/mass"
import {BOUNDARY_INITIAL_STATE_METHOD, BOUNDARY_INITIAL_PROJECTION_METHOD} from "shared/protocol/boundary/initial"
import type {RootMetaLifecycleBindings} from "../../../../quantum/dark/runtime"

const massKey = "11111111-1111-4111-8111-111111111111"

const domain = Bun.env.COSMOS_QUANTUM_DOMAIN
if (domain) {
  await runQuantumDomain(domain)
  const energyMass = domain === "energy" ? new EnergyMassCatalog() : undefined
  if (energyMass && Bun.env.QUANTUM_FIXTURE_MASS_VALUE && !(await energyMass.read(massKey, "binary")).length) {
    await energyMass.write(massKey, "binary", new TextEncoder().encode(Bun.env.QUANTUM_FIXTURE_MASS_VALUE))
  }
  await Bun.write(join(process.cwd(), `fixture-${domain}.json`), JSON.stringify({domain, pid: process.pid, executable: process.argv[1], cwd: process.cwd(),
    massRoot: domain === "boundary" ? new MassCatalog().root : energyMass?.root,
    ...(energyMass ? {massValue: new TextDecoder().decode(await energyMass.read(massKey, "binary"))} : {}),
  }))
} else {
  const stateRoot = Bun.env.QUANTUM_FIXTURE_STATE!
  const rootFile = Bun.env.QUANTUM_FIXTURE_ROOT_FILE
  const installedRoot = Bun.env.QUANTUM_FIXTURE_INSTALLED_ROOT
  const lifecycle = Bun.env.QUANTUM_FIXTURE_LIFECYCLE
  const native = Bun.env.QUANTUM_FIXTURE_PEER === "1"
  const local = native ? createLocalOracleChannelPair("fixture-local-reader", () => []) : undefined
  const localPeer = local ? new OracleRpcPeer(local.peer) : undefined
  let rootReads = 0
  let sourceReads = 0
  let initialFieldReads = 0
  const initialFieldsFile = Bun.env.QUANTUM_FIXTURE_INITIAL_FIELDS_FILE
  const quantum = await prepareQuantumRuntime({...quantumRuntimeOptions(stateRoot)!, executable: process.argv[1]!, transport: native ? "peer" : "websocket", readyTimeoutMs: 15_000,
    ...(local ? {localOracleChannels: [local.router]} : {}),
    ...(lifecycle ? {lifecycle: JSON.parse(lifecycle) as RootMetaLifecycleBindings} : {}),
    ...(initialFieldsFile ? {initialRootFields: async () => {
      initialFieldReads++
      return await Bun.file(initialFieldsFile).json()
    }} : {}),
    energyEnvironment: {COSMOS_NETWORK_PREPARATION_FILE: Bun.env.QUANTUM_FIXTURE_NETWORK_PREPARATION_FILE},
    ...(installedRoot ? {root: async () => {rootReads++; return {source: installedRoot}}} : {}),
    ...(rootFile ? {root: async () => {
      rootReads++
      return {source: "fixture/initialized", readMeta: async (source: string) => {
        sourceReads++
        return await Bun.file(source === "fixture/initialized" ? rootFile : join(dirname(rootFile), "child.json")).json()
      }}
    }} : {}),
  })
  const server = Bun.serve<QuantumRuntimeSocketData>({port: 0, hostname: "127.0.0.1",
    fetch: (request, current) => quantum.fetch(request, current), websocket: quantum.websocket,
  })
  let stopping: Promise<void> | undefined
  const close = () => stopping ??= (async () => {
    await quantum.close()
    localPeer?.close()
    await local?.peer.close()
    await server.stop(true)
    process.send?.({type: "closed"})
    process.disconnect?.()
  })()
  process.on("message", message => {
    if (message === "stop") void close()
    if (message === "hold-and-stop") void quantum.dark.quiesce().then(close).catch(error => {
      console.error(error)
      void close()
    })
    if (message === "seed-quiesce") void (async () => {
      await quantum.dark.seed(["fixture/quantum"])
      await quantum.dark.quiesce()
      const ownHeld = quantum.dark.status().externalAdmission
      await quantum.dark.resume()
      const ownResumed = quantum.dark.status().externalAdmission
      const transport = new OracleTransport("fixture-pause-reader", server.url)
      const peer = new OracleRpcPeer(transport.channel)
      try {
        await transport.open({methods: [], waitMs: 1000})
        await peer.call("dark", DARK_FORCE_PAUSE_METHOD, {})
        const before = await peer.call("dark", DARK_FORCE_STACK_METHOD, {})
        await quantum.dark.quiesce()
        await quantum.dark.resume()
        const after = await peer.call("dark", DARK_FORCE_STACK_METHOD, {})
        const borrowedAdmission = quantum.dark.status().externalAdmission
        await peer.call("dark", DARK_FORCE_RESUME_METHOD, {})
        process.send?.({type: "quiesced", ownHeld, ownResumed, borrowedAdmission, before, after})
      } finally {
        peer.close()
        await transport.close()
      }
    })().catch(error => process.send?.({type: "case-failed", message: error.message}))
  })
  void quantum.failure.catch(async error => {
    if (!stopping) {
      console.error(error)
      await close()
      process.exitCode = 1
    }
  })
  try {
    const initialization = await quantum.start(server.port!)
    const initialFieldsRefusal = initialFieldsFile ? await quantum.dark.applyInitialRootFields({label: "too-late"})
      .then(() => null, error => error.message) : undefined
    const quiesceRefusal = await quantum.dark.quiesce().then(async () => {await quantum.dark.resume(); return null}, error => ({code: error.code, message: error.message}))
    const children = await Promise.all(["boundary", "energy", "matrix"].map(async name => {
      const file = Bun.file(join(stateRoot, `fixture-${name}.json`))
      const deadline = Date.now() + 3000
      while (!await file.exists()) {
        if (Date.now() > deadline) throw new Error(`Missing compiled ${name} evidence`)
        await Bun.sleep(10)
      }
      return await file.json()
    }))
    let world: {state: unknown, projection: unknown} | undefined
    if (rootFile || installedRoot) {
      const transport = new OracleTransport("fixture-initialization-reader", server.url)
      const peer = new OracleRpcPeer(transport.channel)
      try {
        if (!localPeer) await transport.open({methods: [], waitMs: 1000})
        const reader = localPeer ?? peer
        world = {state: await reader.call("boundary", BOUNDARY_INITIAL_STATE_METHOD, {}),
          projection: await reader.call("boundary", BOUNDARY_INITIAL_PROJECTION_METHOD, {})}
      } finally {peer.close(); await transport.close()}
    }
    process.send?.({type: "ready", origin: server.url.origin, health: await quantum.dark.health(), children, quiesceRefusal,
      initialization, rootReads, sourceReads, initialFieldReads, initialFieldsRefusal, world, ...(localPeer ? {graph: await localPeer.call("dark", READ_GRAPH_METHOD, {})} : {})})
  } catch (error) {
    console.error(error)
    await close()
    process.exitCode = 1
  }
}
