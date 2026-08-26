import {afterEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join} from "node:path"
import {pathToFileURL} from "node:url"
import {
  DARK_BULK_VIEWPORT_CAPTURE_METHOD,
  type DarkBulkViewportCaptureRequest,
} from "shared/protocol/bulk/browser"
import {
  META_AUTHORING_CONTRACT_VERSION,
  META_CAPABILITIES_READ_METHOD,
  META_DECLARATION_APPLY_METHOD,
  META_DECLARATION_WRITE_CAPABILITY,
  META_SOURCE_READ_CAPABILITY,
  META_SOURCE_REVISION_READ_METHOD,
  type MetaCapabilitiesReadReceipt,
  type MetaDeclarationApplyReceipt,
  type MetaDeclarationRequest,
  type MetaSourceRevisionReadReceipt,
} from "shared/protocol/metafor/authoring"
import {
  READ_GRAPH_METHOD,
  parseMetaAddress,
  type Graph,
  type MetaAddress,
} from "@metafor/types/metafor/graph"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import {
  DARK_FORCE_HISTORY_READ_METHOD,
  ENERGY_MASS_RESULT_READ_METHOD,
  META_FIELD_VALUE_APPLY_METHOD,
  META_PROCESS_EXECUTION_READ_METHOD,
  type DarkForceHistoryReadReceipt,
  type EnergyMassResultReadReceipt,
  type MetaFieldValueApplyReceipt,
  type MetaProcessExecutionReadReceipt,
  type MetaRuntimeAtomLocator,
} from "shared/protocol/metafor/observation"
import {
  BULK_VIEWPORT_CAPTURE_METHOD,
  BULK_VIEWPORT_CAPTURE_VERSION,
  type BulkViewportCaptureControlRequest,
  type BulkViewportCaptureControlResponse,
  type BulkViewportCaptureResult,
} from "shared/protocol/bulk/capture"
import {
  isOracleRpcCall,
  isOracleRpcResponse,
  type OracleRpcMessage,
} from "shared/protocol/oracle/rpc"
import {
  sourceForceMessage,
  unsourceForceMessage,
  type ForceMessage,
  type ForceMessageInput,
  type SourcedForceMessage,
} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  OracleRpcPeer,
  type OracleChannel,
  type OracleChannelListener,
} from "shared/transport/oracle"
import {BoundaryOracle} from "../boundary/oracle.ts"
import {open, type BoundaryDatabase} from "../boundary/sqlite.ts"
import {BulkViewportCaptureRegistry, type BulkViewportObserverClient} from "../bulk/capture.ts"
import {BulkOracle} from "../bulk/oracle.ts"
import {bulkStoreCaptureProof} from "../bulk/store-render.ts"
import {EnergyCatalogStore} from "../energy/graph/catalog.ts"
import {startEnergyProtocol} from "../energy/energy.ts"
import {createFilesystemEnergyMassStore, EnergyMassCatalog, EnergyMassGate} from "../energy/mass.ts"
import {EnergyMassResultReadService} from "../energy/oracle/mass-result.ts"
import type {EnergyForce, EnergyProtocol} from "../energy/types/protocol.ts"
import {sourceRevision} from "../../create-metafor/src/source.ts"
import {evaluateMetaSource} from "../dark/load.ts"
import {readDarkDeclarationProjection} from "../dark/graph/declaration.ts"
import {DarkForceHistory} from "../dark/force/history.ts"
import {ForceLifecycle} from "../dark/force/lifecycle.ts"
import {forceDomains, type ForceDomain, type ForceStore} from "../dark/force/store.ts"
import {DarkOracle} from "../dark/oracle.ts"
import {MetaCreateService} from "../dark/oracle/create.ts"
import {DeclarationAuthoringService, type DeclarationAuthoringMetaReader} from "../dark/oracle/declaration.ts"
import {DarkForceHistoryReadService} from "../dark/oracle/history.ts"
import {MatterAuthoringService} from "../dark/oracle/matter.ts"
import {MetaRuntimeRpcService} from "../dark/oracle/runtime.ts"
import {MetaAuthoringRegistry, metaAuthoringCapabilitiesForScopes} from "../dark/oracle/registry.ts"
import {DarkForceTimeController} from "../dark/time-control.ts"
import {createForceTestFixture, type ForceTestFixture} from "../dark/force/fixture.ts"
import {prepareMatrixBirth} from "../matrix/birth.ts"
import {weak$} from "../matrix/weak"

const ROOT = parseMetaAddress("test/agent-session")!
const AGENT = "agent/local"
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const PNG_BYTES = 68

type ParticleInput = Omit<Particle, "ts" | "by"> & {ts?: number}

class MemoryOracleChannel implements OracleChannel {
  readonly methods: readonly string[] = []
  readonly #listeners = new Set<OracleChannelListener>()

  constructor(readonly identity: string, private readonly bus: MemoryOracleBus) {}

  async send(message: OracleRpcMessage): Promise<void> {
    await this.bus.send(this.identity, message)
  }

  subscribe(listener: OracleChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async receive(message: OracleRpcMessage): Promise<void> {
    await Promise.all([...this.#listeners].map((listener) => listener(message)))
  }

  async close(): Promise<void> {
    this.#listeners.clear()
  }
}

class MemoryOracleBus {
  readonly #channels = new Map<string, MemoryOracleChannel>()
  readonly #callers = new Map<string, string>()

  peer(identity: string): OracleRpcPeer {
    if (this.#channels.has(identity)) throw new Error(`Duplicate Oracle identity: ${identity}`)
    const channel = new MemoryOracleChannel(identity, this)
    this.#channels.set(identity, channel)
    return new OracleRpcPeer(channel)
  }

  async send(source: string, message: OracleRpcMessage): Promise<void> {
    if (isOracleRpcCall(message)) {
      const target = this.#channels.get(message.target)
      if (!target) throw new Error(`Oracle target is unavailable: ${message.target}`)
      this.#callers.set(message.id, source)
      await target.receive({...message, source})
      return
    }
    if (isOracleRpcResponse(message)) {
      const caller = this.#callers.get(message.id)
      if (!caller) throw new Error(`Oracle caller is unavailable: ${message.id}`)
      this.#callers.delete(message.id)
      await this.#channels.get(caller)!.receive(message)
      return
    }
    throw new Error("Memory Oracle bus received an already routed call")
  }
}

const roots: string[] = []
const boundaries: BoundaryDatabase[] = []
const forceFixtures: ForceTestFixture[] = []
const energyProtocols: EnergyProtocol[] = []
const originalWeakBackend = Bun.env.METAFOR_WEAK_BACKEND

afterEach(async () => {
  for (const protocol of energyProtocols.splice(0)) protocol.close()
  for (const fixture of forceFixtures.splice(0)) fixture.close()
  weak$.dispose()
  if (originalWeakBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = originalWeakBackend
  for (const boundary of boundaries.splice(0)) await boundary.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})))
})

const initialSource = `export default MetaFor("Agent Session", { desc: "One complete RPC session." })
  .fields((field) => ({
    trigger: field.number.required(0),
    output: field.number.required(0),
  }))
  .superposition({
    idle: { ready: { trigger: { eq: 4 } } },
    ready: null,
  })
  .mass((mass) => ({
    profile: mass.json(),
  }))
  .energy()
  .processes((process) => [
    process("ready", { env: ["server"] })
      .action(async ({ mass, value }) => {
        const action = await import("./actions/ready.ts");
        return action.default({ mass, value });
      })
      .success(({ data, update }) => update({ output: data.output })),
  ])
  .reactions(() => [])
  .matter(({ html }) => html\`\`)
  .bulk()
`

const forceMessage = (part: ParticleInput): ForceMessage => ({
  parts: [{ts: 1, ...part} as Particle],
})

describe("one complete trusted agent RPC session", () => {
  test("uses only the explicit envelope and public RPC receipts from source edit through Bulk evidence", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "metafor-agent-session-"))
    roots.push(temporary)
    const metaPath = join(temporary, "cluster", ROOT, "meta.ts")
    await mkdir(dirname(metaPath), {recursive: true})
    await writeFile(metaPath, initialSource)
    const actionPath = join(dirname(metaPath), "actions", "ready.ts")
    await mkdir(dirname(actionPath), {recursive: true})
    await writeFile(
      actionPath,
      "export default async ({mass, value}) => { await mass.profile.write({processed: value.trigger}); return {output: value.trigger * 2} }\n",
    )

    const boundary = await open(":memory:")
    boundaries.push(boundary)
    for (const part of [
      {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Agent Session", desc: "One complete RPC session."}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "trigger", type: "number", required: true, default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 2, key: "output", type: "number", required: true, default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 2, name: "ready", position: 1, transitions: []}},
      {
        part: "inflaton", op: "add", path: "state", value: {
          wimp: ROOT, id: 1, name: "idle", position: 0,
          transitions: [{
            id: 1, position: 0, to: 2,
            conditions: [{id: 1, position: 0, field: 1, predicate: {eq: 4}}],
          }],
        },
      },
      {part: "inflaton", op: "add", path: "mass", value: {wimp: ROOT, id: 1, key: "profile", format: "json"}},
    ] as ParticleInput[]) await boundary.materialize(forceMessage(part))
    const atom = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT}
    `)[0]!.id)
    await boundary.materialize(forceMessage({
      part: "photon", op: "replace", path: atom, from: "agent-session-idle", value: "idle",
    }))
    const fields = await boundary.projection.sql<Array<{id: number; key: string}>>`
      SELECT id, key FROM field WHERE wimp = ${ROOT}
    `
    const triggerField = Number(fields.find(({key}) => key === "trigger")!.id)
    const outputField = Number(fields.find(({key}) => key === "output")!.id)
    await boundary.materialize(forceMessage({
      part: "inflaton",
      op: "add",
      path: "process",
      value: {
        wimp: ROOT,
        id: 1,
        key: "ready",
        type: "action",
        env: ["server"],
        action: {
          src: pathToFileURL(actionPath).href,
          read: [triggerField],
        },
        success: {src: "({data, update}) => update({output: data.output})", read: [], write: [outputField]},
      },
    }))
    const bus = new MemoryOracleBus()
    const boundaryPeer = bus.peer("boundary")
    const darkPeer = bus.peer("dark")
    const energyPeer = bus.peer("energy")
    const bulkPeer = bus.peer("bulk")
    const agent = bus.peer(AGENT)
    const captures = new BulkViewportCaptureRegistry({
      minIntervalMs: 0,
      randomId: () => "agent-session-capture",
    })
    darkPeer.expose(
      DARK_BULK_VIEWPORT_CAPTURE_METHOD,
      async (params: unknown) => {
        const request = params as DarkBulkViewportCaptureRequest
        return await captures.capture(request.params, {source: request.source})
      },
    )

    const boundaryOracle = new BoundaryOracle(boundary)
    boundaryOracle.onServerStarted(boundaryPeer)

    const bulk = new BulkOracle()
    bulk.onServerStarting(bulkPeer)
    await bulk.onServerStarted(bulkPeer)
    bulk.onRuntimeBorn()
    const initialBulk = await bulk.openFreshObserver(bulkPeer, "initial-agent-session")
    const initialBulkProof = bulkStoreCaptureProof(initialBulk.store)

    const energyCatalog = new EnergyCatalogStore()
    for (const entry of (await boundary.initialProjection()).entries) {
      energyCatalog.apply({...entry, ts: 0})
    }
    const massFiles = new EnergyMassCatalog(join(temporary, "mass"))
    const massGate = new EnergyMassGate()
    const massArtifact = energyCatalog.mass(atom).find(({key}) => key === "profile")!
    const massStore = createFilesystemEnergyMassStore(massGate, massFiles)
    massStore.authorize?.(
      {energyId: "energy-agent-session", atomId: atom, wimp: ROOT, state: "idle"},
      energyCatalog.mass(atom),
    )
    await massFiles.write(massArtifact.keyId, "json", JSON.stringify({processed: null}))

    Bun.env.METAFOR_WEAK_BACKEND = "cpu"
    await prepareMatrixBirth(await boundary.initialState())
    const forceFixture = createForceTestFixture()
    forceFixtures.push(forceFixture)
    const waitingForMatrix = forceFixture.nextClient("matrix")
    await import(`../matrix/matrix.ts?agent-session=${crypto.randomUUID()}`)
    const matrixClient = await waitingForMatrix
    await Bun.sleep(0)
    await Bun.sleep(0)
    let matrixMessageCursor = forceFixture.messages.length

    const history = new DarkForceHistory(join(temporary, "history", "v1"), {
      cutId: "agent-session-cut",
      startedAt: "2026-08-04T12:00:00.000Z",
    })
    const lifecycle = new ForceLifecycle(history)
    const queue: Array<{domain: ForceDomain; message: SourcedForceMessage}> = []
    const channels = Object.fromEntries(forceDomains.map((domain) => [domain, {
      domain,
      send(message: SourcedForceMessage) {
        queue.push({domain, message: structuredClone(message)})
      },
    }])) as ForceStore
    lifecycle.start(channels)
    for (const domain of forceDomains) lifecycle.channelReady(domain)

    const historyReads = new DarkForceHistoryReadService(history)
    const registry = new MetaAuthoringRegistry(
      [[AGENT, metaAuthoringCapabilitiesForScopes([ROOT])]],
      () => metaPath,
    )
    const readMeta: DeclarationAuthoringMetaReader = async (address) => {
      if (address !== ROOT) throw new Error(`Unexpected session Meta: ${address}`)
      const source = await readFile(metaPath, "utf8")
      const declaration = await evaluateMetaSource(source)
      return {
        address,
        targetPath: metaPath,
        source,
        revision: sourceRevision(source),
        name: declaration.name,
        ...(declaration.desc === undefined ? {} : {description: declaration.desc}),
        fields: declaration.fields as MetaFieldDSL[],
        states: declaration.superposition,
        mass: declaration.mass ?? [],
        processes: declaration.processes ?? [],
        reactions: declaration.reactions ?? [],
        ...(declaration.bulk === undefined ? {} : {bulk: declaration.bulk}),
      }
    }
    const matter = new MatterAuthoringService(
      history,
      lifecycle,
      (source) => registry.grants(source),
      async (address) => {
        if (address !== ROOT) throw new Error(`Unexpected Matter Meta: ${address}`)
        const source = await readFile(metaPath, "utf8")
        const current = await evaluateMetaSource(source)
        return {
          address,
          targetPath: metaPath,
          source,
          revision: sourceRevision(source),
          matter: current.matter ?? [],
        }
      },
      () => metaPath,
    )
    const declaration = new DeclarationAuthoringService(
      history,
      lifecycle,
      (source) => registry.grants(source),
      readMeta,
      () => metaPath,
    )
    const dark = new DarkOracle(async (params) => await readDarkDeclarationProjection(params, async (address) => {
      if (address !== ROOT) throw new Error(`Unexpected Graph Meta: ${address}`)
      return await evaluateMetaSource(await readFile(metaPath, "utf8"))
    }))
    dark.setTimeControl(new DarkForceTimeController(lifecycle, null))
    dark.setHistory(historyReads)
    dark.setRuntime(new MetaRuntimeRpcService(history, lifecycle, darkPeer))
    dark.setAuthoring({
      registry,
      create: new MetaCreateService((source) => registry.grants(source), join(temporary, "cluster")),
      matter,
      declaration,
    })
    dark.onServerStarted(darkPeer)
    dark.onChannelOpened()

    const massResults = new EnergyMassResultReadService(
      energyCatalog,
      massFiles,
      massGate,
      async () => await energyPeer.call<DarkForceHistoryReadReceipt>(
        "dark",
        DARK_FORCE_HISTORY_READ_METHOD,
        {contractVersion: 1, query: {kind: "frontier"}},
      ),
    )
    energyPeer.expose(ENERGY_MASS_RESULT_READ_METHOD, async (input) => await massResults.read(input))
    boundaryOracle.onChannelOpened()

    let execution = ""
    const publish = async (domain: ForceDomain, input: ForceMessageInput): Promise<void> => {
      const part = input.parts[0]
      if (domain === "matrix" && part.part === "photon" && part.op === "test" && typeof part.from === "string") {
        execution = part.from
      }
      const decision = await lifecycle.acceptParticle(domain, sourceForceMessage(input, domain))
      if (!decision.ok) throw new Error(decision.error)
    }

    const energyPublishes = new Set<Promise<void>>()
    const energyForce: EnergyForce = {
      onImpulse: () => {},
      impulse(message) {
        let pending!: Promise<void>
        pending = publish("energy", unsourceForceMessage(message)).finally(() => energyPublishes.delete(pending))
        energyPublishes.add(pending)
      },
    }
    const energyProtocol = startEnergyProtocol({
      force: energyForce,
      catalog: energyCatalog,
      energyId: "energy-agent-session",
      runtimeKind: "server",
      massStore,
    })
    energyProtocols.push(energyProtocol)

    const collectMatrixOutput = async (): Promise<void> => {
      let stableTurns = 0
      let observed = forceFixture.messages.length
      while (stableTurns < 3) {
        await Bun.sleep(0)
        const current = forceFixture.messages.length
        if (current === observed) stableTurns += 1
        else {
          observed = current
          stableTurns = 0
        }
      }
      const entries = forceFixture.messages.slice(matrixMessageCursor)
        .filter((entry) => entry.client === matrixClient)
      matrixMessageCursor = forceFixture.messages.length
      for (const entry of entries) await publish("matrix", unsourceForceMessage(entry.message))
    }

    const drain = async (throughSequence: number): Promise<void> => {
      const deadline = Date.now() + 2_000
      while (true) {
        while (queue.length > 0) {
          const delivery = queue.shift()!
          if (delivery.domain === "boundary") {
            const commit = await boundary.materialize(delivery.message)
            for (const derived of commit?.messages ?? []) {
              await publish("boundary", unsourceForceMessage(derived))
            }
            continue
          }
          if (delivery.domain === "bulk") {
            bulk.acceptImpulse(delivery.message)
            continue
          }
          if (delivery.domain === "energy") {
            await energyForce.onImpulse(unsourceForceMessage(delivery.message))
            await energyProtocol.quiesce()
            continue
          }
          if (delivery.domain === "matrix") {
            forceFixture.impulse(matrixClient, delivery.message)
            await collectMatrixOutput()
          }
        }
        await energyProtocol.quiesce()
        if (energyPublishes.size > 0) await Promise.all([...energyPublishes])
        await collectMatrixOutput()
        if (
          queue.length === 0 && energyPublishes.size === 0 &&
          history.status().sequence >= throughSequence
        ) return
        if (Date.now() >= deadline) {
          throw new Error(`Agent session did not reach Force sequence ${throughSequence}`)
        }
        await Bun.sleep(1)
      }
    }

    const repositoryRoot = join(import.meta.dir, "../..")
    const git = Bun.spawn(["git", "rev-parse", "HEAD"], {cwd: repositoryRoot, stdout: "pipe", stderr: "pipe"})
    const gitRevision = (await new Response(git.stdout).text()).trim()
    expect(await git.exited).toBe(0)
    const rules = await Promise.all([
      "create-metafor/rules/metafor.md",
      "create-metafor/rules/rpc.md",
      "docs/FORCE.md",
    ].map(async (path) => ({path, revision: sourceRevision(await readFile(join(repositoryRoot, path), "utf8"))})))
    const capabilities = await agent.call<MetaCapabilitiesReadReceipt>(
      "dark",
      META_CAPABILITIES_READ_METHOD,
      {contractVersion: META_AUTHORING_CONTRACT_VERSION},
    )
    const revisions = await agent.call<MetaSourceRevisionReadReceipt>(
      "dark",
      META_SOURCE_REVISION_READ_METHOD,
      {contractVersion: 1, capability: META_SOURCE_READ_CAPABILITY, addresses: [ROOT]},
    )
    const snapshot = await agent.call<Graph>("dark", READ_GRAPH_METHOD, {})
    const frontier = await agent.call<DarkForceHistoryReadReceipt>(
      "dark",
      DARK_FORCE_HISTORY_READ_METHOD,
      {contractVersion: 1, query: {kind: "frontier"}},
    )
    const rootOccurrence = snapshot.runtime.roots[0]
    if (!rootOccurrence || rootOccurrence.kind !== "atom") throw new Error("Agent snapshot root Atom is absent")
    const locator: MetaRuntimeAtomLocator = {root: snapshot.root, ref: rootOccurrence.ref, meta: ROOT}
    const initialMass = await agent.call<EnergyMassResultReadReceipt>(
      "energy",
      ENERGY_MASS_RESULT_READ_METHOD,
      {contractVersion: 1, atom: locator, key: "profile", maxBytes: 4096},
    )
    const envelope = {
      rules,
      revisions: {git: gitRevision, sources: revisions.sources},
      capabilities: capabilities.capabilities,
      snapshot,
      frontier: frontier.frontier,
      task: {goal: "add one Field and drive trigger to a verified Process result", scope: {root: ROOT}},
    }

    expect(Object.keys(envelope)).toEqual(["rules", "revisions", "capabilities", "snapshot", "frontier", "task"])
    expect(envelope.rules).toHaveLength(3)
    expect(envelope.rules.every(({revision}) => /^sha256:[a-f0-9]{64}$/.test(revision))).toBe(true)
    expect(envelope.revisions.git).toMatch(/^[a-f0-9]{40}$/)
    expect(envelope.capabilities.map(({capability}) => capability)).toEqual([
      "meta.create",
      "meta.declaration.write",
      "meta.matter.write",
      "meta.source.read",
    ])
    expect(envelope.snapshot.runtime.roots).toHaveLength(1)
    expect(envelope.frontier).toEqual({cutId: "agent-session-cut", throughSequence: 0, retroactiveComplete: false})
    expect(initialMass.content).toEqual({format: "json", present: true, value: {processed: null}})

    const structuralRequest: MetaDeclarationRequest = {
      contractVersion: 1,
      operationId: "agent-session-add-note",
      capability: META_DECLARATION_WRITE_CAPABILITY,
      operation: "add",
      entity: "field",
      address: ROOT,
      field: {key: "note", type: "string", required: false, default: "ready"},
      revisions: envelope.revisions.sources,
    }
    const structural = await agent.call<MetaDeclarationApplyReceipt>(
      "dark",
      META_DECLARATION_APPLY_METHOD,
      structuralRequest,
    )
    await drain(3)
    expect(structural).toMatchObject({
      phase: "complete",
      boundary: "applied",
      source: {outcome: "published"},
      materialization: {outcome: "applied"},
    })
    expect(await readFile(metaPath, "utf8")).toContain("note: field.string.optional(\"ready\")")
    const structuralGraph = await agent.call<Graph>("dark", READ_GRAPH_METHOD, {})
    expect(structuralGraph.template[ROOT]?.fields.map(({key}) => key)).toEqual(["trigger", "output", "note"])
    expect(structuralGraph.runtime.roots[0]).toMatchObject({values: {trigger: 0, output: 0, note: "ready"}})
    const structuralDelta = await agent.call<DarkForceHistoryReadReceipt>(
      "dark",
      DARK_FORCE_HISTORY_READ_METHOD,
      {
        contractVersion: 1,
        query: {kind: "range", cutId: envelope.frontier.cutId, fromSequence: 1, limit: 64},
      },
    )
    expect(structuralDelta.entries.map(({sequence}) => sequence)).toEqual([1, 2, 3])
    expect(structuralDelta.entries[0]?.authoring).toMatchObject({operationId: "agent-session-add-note"})

    const fieldInput = await agent.call<MetaFieldValueApplyReceipt>(
      "dark",
      META_FIELD_VALUE_APPLY_METHOD,
      {
        contractVersion: 1,
        atom: locator,
        field: "trigger",
        value: 4,
        expectedFrontier: structuralDelta.frontier,
      },
    )
    await drain(11)
    expect(fieldInput.acceptance).toEqual({cutId: "agent-session-cut", sequence: 4, id: "agent-session-cut:4"})

    const graph = await agent.call<Graph>("dark", READ_GRAPH_METHOD, {})
    expect(execution).toMatch(/^[^:]{1,128}$/)
    const process = await agent.call<MetaProcessExecutionReadReceipt>(
      "dark",
      META_PROCESS_EXECUTION_READ_METHOD,
      {contractVersion: 1, atom: locator, process: "ready", execution},
    )
    const mass = await agent.call<EnergyMassResultReadReceipt>(
      "energy",
      ENERGY_MASS_RESULT_READ_METHOD,
      {contractVersion: 1, atom: locator, key: "profile", maxBytes: 4096},
    )
    const runtimeDelta = await agent.call<DarkForceHistoryReadReceipt>(
      "dark",
      DARK_FORCE_HISTORY_READ_METHOD,
      {
        contractVersion: 1,
        query: {
          kind: "range",
          cutId: structuralDelta.frontier.cutId,
          fromSequence: structuralDelta.frontier.throughSequence + 1,
          limit: 64,
        },
      },
    )

    const observer: BulkViewportObserverClient = {
      domain: "bulk",
      id: "agent-session-observer",
      send(control: BulkViewportCaptureControlRequest) {
        void (async () => {
          const current = await bulk.openFreshObserver(bulkPeer, "agent-session-observer")
          const response: BulkViewportCaptureControlResponse = {
            control: "bulk.viewport.capture.response",
            version: BULK_VIEWPORT_CAPTURE_VERSION,
            id: control.id,
            result: {
              ok: true,
              capture: {
                version: BULK_VIEWPORT_CAPTURE_VERSION,
                observer: {domain: "bulk", id: "agent-session-observer"},
                viewport: {cssWidth: 640, cssHeight: 360, pixelWidth: 1280, pixelHeight: 720, devicePixelRatio: 2},
                sequence: control.sequence,
                capturedAt: "2026-08-04T12:01:00.000Z",
                store: bulkStoreCaptureProof(current.store),
                mimeType: "image/png",
                pngBytes: PNG_BYTES,
                pngBase64: PNG_BASE64,
              },
            },
          }
          captures.receive(observer, response)
        })()
        return true
      },
    }
    const disconnect = captures.connect(observer, "agent-session-observer")
    const viewport = await agent.call<BulkViewportCaptureResult>(
      "bulk",
      BULK_VIEWPORT_CAPTURE_METHOD,
      {version: BULK_VIEWPORT_CAPTURE_VERSION, observerId: observer.id},
    )
    disconnect()

    expect(graph.runtime.roots[0]).toMatchObject({state: "ready", values: {trigger: 4, output: 8, note: "ready"}})
    expect(process).toMatchObject({
      status: "committed",
      acceptance: {cutId: "agent-session-cut", sequence: 6, id: "agent-session-cut:6"},
      settlement: {cutId: "agent-session-cut", sequence: 12, id: "agent-session-cut:12"},
      outcome: {fields: {output: 8}},
      frontier: {cutId: "agent-session-cut", throughSequence: 12},
    })
    expect(mass).toMatchObject({
      frontier: {cutId: "agent-session-cut", throughSequence: 12},
      content: {format: "json", present: true, value: {processed: 4}},
    })
    expect(runtimeDelta.entries.map(({sequence}) => sequence)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(runtimeDelta.range).toMatchObject({requestedFromSequence: 4, firstSequence: 4, lastSequence: 12, truncated: false})
    expect(JSON.stringify(runtimeDelta)).not.toContain("template")
    expect(viewport).toMatchObject({
      ok: true,
      capture: {
        observer: {id: "agent-session-observer"},
        mimeType: "image/png",
        pngBytes: PNG_BYTES,
      },
    })
    if (!viewport.ok) throw new Error(viewport.error.message)
    expect(viewport.capture.store.rows.field).toBeGreaterThan(initialBulkProof.rows.field)

    const revised = await agent.call<MetaSourceRevisionReadReceipt>(
      "dark",
      META_SOURCE_REVISION_READ_METHOD,
      {contractVersion: 1, capability: META_SOURCE_READ_CAPABILITY, addresses: [ROOT]},
    )
    expect(revised.sources[0]?.revision).toBe(structural.sourceProjections[0]?.afterRevision)
    expect(revised.sources[0]?.revision).not.toBe(envelope.revisions.sources[0]?.revision)
  })
})
