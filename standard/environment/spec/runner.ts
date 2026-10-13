/** Reusable isolated acceptance runner; live provider use requires an explicit command from its caller. */
import {cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink} from "node:fs/promises"
import {tmpdir} from "node:os"
import {extname, join, resolve} from "node:path"
import {prepareMetaPackage, type PreparedMetaPackage} from "../../../tech/build/index"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph, type PublishedReleasePackage} from "../../../tech/release/installed"
import {createInstalledMetaMapping} from "../../../cosmos/release/server/installed/metas"
import {evaluateMetaSource} from "../../../quantum/dark/load"
import {READ_GRAPH_METHOD, type Graph, type RuntimeAtom, type RuntimeNode} from "@metafor/types/metafor/graph"
import {READ_AGENTS_METHOD, type ReadAgentsReceipt} from "@metafor/types/metafor/agent-observation"
import {
  DARK_FORCE_HISTORY_READ_METHOD, ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, META_PROCESS_EXECUTION_READ_METHOD,
  type DarkForceHistoryReadReceipt, type EnergyMassResultReadReceipt, type MetaProcessExecutionReadReceipt,
} from "shared/protocol/metafor/observation"

const repository = resolve(import.meta.dir, "../../..")
const names = ["environment", "agent", "chat", "provider", "scenario", "codespace"] as const
const firstAnswer = "Первый integrity сценарий выполнен."
const secondAnswer = "Второй integrity сценарий выполнен в той же беседе."
function check(condition: unknown, message: string): asserts condition {if (!condition) throw new Error(message)}

function packageGraph(prepared: PreparedMetaPackage): PublishedReleasePackage {
  return {name: prepared.address, version: prepared.version, dependencies: {}, environments: [{env: "server",
    publicArtifacts: Object.fromEntries(prepared.owner.sources.filter(source => source.artifact !== ".").map(source => [source.artifact,
      /\.[cm]?[jt]sx?$/.test(source.source) ? ".js" : extname(source.source)])),
    outputs: prepared.result.outputs.map(output => ({artifact: output.artifact!, kind: output.kind!, type: output.type,
      sha256: output.sha256, size: output.size, ...(output.load ? {load: output.load} : {}), ...(output.sourceMapFor ? {sourceMapFor: output.sourceMapFor} : {})})),
  }]}
}

export function graphAtoms(graph: Graph): RuntimeAtom[] {
  const pending: RuntimeNode[] = [...graph.runtime.roots]
  const atoms: RuntimeAtom[] = []
  for (let index = 0; index < pending.length; index++) {
    const node = pending[index]!
    if (node.kind === "atom") atoms.push(node)
    pending.push(...(node.children ?? []))
  }
  return atoms
}

function actor(graph: Graph, name: typeof names[number]): RuntimeAtom {
  const matches = graphAtoms(graph).filter(atom => atom.meta === `@metafor/${name}`)
  check(matches.length === 1, `Expected one standard ${name} Atom`)
  return matches[0]!
}
const locator = (graph: Graph, atom: RuntimeAtom) => ({root: graph.root, ref: atom.ref, meta: atom.meta})
const identities = (graph: Graph) => Object.fromEntries(names.map(name => {
  const atom = actor(graph, name)
  return [name, {ref: atom.ref, mass: atom.mass.map(mass => ({key: mass.key, ref: mass.ref}))}]
}))

type Ready = {type: "ready"; initialization: {mode: "initialized" | "restored"}; rootReads: number; children: {domain: string; pid: number}[]; graph: Graph}
type Pending = {resolve(value: unknown): void; reject(error: unknown): void; deadline: ReturnType<typeof setTimeout>}

export async function launchInstalledAgentWorld(input: {executable: string; directory: string; stateRoot: string; storeRoot: string;
  mapping: unknown; command: readonly string[]; cwd: string; fixtureStore?: string; replyFile?: string; live?: boolean}) {
  await Promise.all(["boundary", "energy", "matrix"].map(domain => rm(join(input.stateRoot, `agent-fixture-${domain}.json`), {force: true})))
  const ready = Promise.withResolvers<Ready>()
  const pending = new Map<string, Pending>()
  const child = Bun.spawn({cmd: [process.execPath, input.executable], cwd: input.directory,
    env: {PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      ...(input.live ? {HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME} : {}),
      METAFOR_WEAK_BACKEND: "cpu", METAFOR_META_ARTIFACT_ROOT: input.storeRoot, METAFOR_META_ARTIFACT_MAP: JSON.stringify(input.mapping),
      ORACLE_ENVIRONMENT_FIXTURE_STATE: input.stateRoot, ORACLE_AGENT_CODEX_COMMAND: JSON.stringify(input.command),
      ORACLE_AGENT_CODEX_CWD: input.cwd, ORACLE_AGENT_FIXTURE_STORE: input.fixtureStore, ORACLE_AGENT_FIXTURE_REPLY_FILE: input.replyFile},
    stdout: "pipe", stderr: "pipe", ipc(message) {
      if (!message || typeof message !== "object" || !("type" in message)) return
      if (message.type === "ready") {ready.resolve(message as Ready); return}
      if (message.type !== "response" || !("id" in message) || typeof message.id !== "string") return
      const request = pending.get(message.id)
      if (!request) return
      clearTimeout(request.deadline)
      pending.delete(message.id)
      if ("ok" in message && message.ok === true && "result" in message) request.resolve(message.result)
      else request.reject(new Error("error" in message && typeof message.error === "string" ? message.error : "Fixture RPC failed"))
    }})
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  const failure = child.exited.then(async code => {
    const error = new Error(`Installed Agent fixture exited ${code}: ${(await stderr).slice(-6000)}\n${(await stdout).slice(-2000)}`)
    for (const request of pending.values()) {clearTimeout(request.deadline); request.reject(error)}
    pending.clear()
    throw error
  })
  void failure.catch(() => {})
  let closing: Promise<{code: number; stdout: string; stderr: string}> | undefined
  const close = () => closing ??= (async () => {
    if (child.exitCode === null) child.send({type: "close"})
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {await Promise.race([child.exited, new Promise<never>((_, reject) => {deadline = setTimeout(() => reject(new Error("Installed Agent fixture did not close")), 20_000)})])}
    finally {clearTimeout(deadline); if (child.exitCode === null) {child.kill("SIGKILL"); await child.exited}}
    return {code: await child.exited, stdout: await stdout, stderr: await stderr}
  })()
  try {
    let deadline: ReturnType<typeof setTimeout> | undefined
    const evidence = await Promise.race([ready.promise, failure, new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error("Installed Agent fixture readiness timed out")), 45_000)
    })]).finally(() => clearTimeout(deadline))
    return {child, ready: evidence, close,
      call<T>(target: string, method: string, value: unknown): Promise<T> {
        const id = crypto.randomUUID()
        return new Promise<T>((resolve, reject) => {
          const deadline = setTimeout(() => {pending.delete(id); reject(new Error(`Public Oracle ${method} timed out`))}, 15_000)
          pending.set(id, {resolve: value => resolve(value as T), reject, deadline})
          try {child.send({type: "oracle", id, target, method, input: value})}
          catch (error) {clearTimeout(deadline); pending.delete(id); reject(error)}
        })
      },
    }
  } catch (error) {await close().catch(() => {}); throw error}
}
type World = Awaited<ReturnType<typeof launchInstalledAgentWorld>>

async function history(world: World): Promise<DarkForceHistoryReadReceipt> {
  return await world.call("dark", DARK_FORCE_HISTORY_READ_METHOD, {contractVersion: 1, query: {kind: "frontier"}})
}
async function writeField(world: World, graph: Graph, atom: RuntimeAtom, field: string, value: string): Promise<void> {
  const current = await history(world)
  await world.call("dark", META_FIELD_VALUE_APPLY_METHOD, {contractVersion: 1, atom: locator(graph, atom), field, value, expectedFrontier: current.frontier})
}
async function mass(world: World, graph: Graph, name: typeof names[number], key: string): Promise<EnergyMassResultReadReceipt> {
  return await world.call("energy", ENERGY_MASS_RESULT_READ_METHOD, {contractVersion: 1, atom: locator(graph, actor(graph, name)), key, maxBytes: 2 * 1024 * 1024})
}
function jsonContent(receipt: EnergyMassResultReadReceipt): Record<string, unknown> {
  check(receipt.content.format === "json" && receipt.content.present, "Expected persisted JSON Mass")
  return receipt.content.value as Record<string, unknown>
}

async function waitCompleted(world: World, taskId: string, timeout: number): Promise<Graph> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const graph = await world.call<Graph>("dark", READ_GRAPH_METHOD, {})
    const root = actor(graph, "environment")
    if (root.values.status === "failed") throw new Error(`Standard Agent task ${taskId} failed: ${root.values.error}`)
    if (root.values.status === "completed" && actor(graph, "agent").values.activeTaskId === taskId) return graph
    await Bun.sleep(20)
  }
  throw new Error(`Standard Agent task ${taskId} timed out`)
}

async function processEvidence(world: World, graph: Graph): Promise<MetaProcessExecutionReadReceipt[]> {
  const frontier = (await history(world)).frontier
  const entries: DarkForceHistoryReadReceipt["entries"] = []
  let fromSequence: number | null = 1
  while (fromSequence !== null && fromSequence <= frontier.throughSequence) {
    const range: DarkForceHistoryReadReceipt = await world.call<DarkForceHistoryReadReceipt>("dark", DARK_FORCE_HISTORY_READ_METHOD,
      {contractVersion: 1, query: {kind: "range", cutId: frontier.cutId, fromSequence, toSequence: frontier.throughSequence, limit: 512}})
    entries.push(...range.entries)
    fromSequence = range.range?.nextSequence ?? null
  }
  const latest = new Map<string, {atom: RuntimeAtom; process: string; execution: string}>()
  for (const entry of entries) {
    const part = entry.particle
    if (part.part !== "photon" || part.op !== "test" || typeof part.path !== "number" || typeof part.from !== "string" || typeof part.value !== "string") continue
    const atom = graphAtoms(graph).find(atom => atom.ref === `atom:${part.path}`)
    if (!atom || !graph.template[atom.meta]?.processes.some(process => process.key === part.value)) continue
    latest.set(atom.ref, {atom, process: part.value, execution: part.from})
  }
  return await Promise.all([...latest.values()].map(entry => world.call<MetaProcessExecutionReadReceipt>("dark", META_PROCESS_EXECUTION_READ_METHOD,
    {contractVersion: 1, atom: locator(graph, entry.atom), process: entry.process, execution: entry.execution})))
}

/** Prepares four real standard Meta/actions, removes producer, then runs two complete native incarnations. */
export async function runInstalledAgentAcceptance(options: {provider?: "fixture" | "live"; command?: readonly string[]; cwd?: string; keep?: boolean; evidencePath?: string} = {}) {
  const provider = options.provider ?? "fixture"
  check(provider === "fixture" || options.command?.length, "Live acceptance requires an explicit opted-in native command")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-installed-agent-")))
  const producer = join(directory, "producer")
  const stateRoot = join(directory, "state")
  const storeRoot = join(directory, "store")
  const providerCwd = options.cwd ?? join(directory, "provider")
  let world: World | undefined
  const closedPids: number[] = []
  try {
    await Promise.all([mkdir(producer), mkdir(stateRoot), mkdir(providerCwd, {recursive: true})])
    await cp(join(repository, "tsconfig.json"), join(producer, "tsconfig.json"))
    await mkdir(join(producer, "types"))
    await cp(join(repository, "types/metafor-global.d.ts"), join(producer, "types/metafor-global.d.ts"))
    await symlink(join(repository, "node_modules"), join(producer, "node_modules"))
    const prepared: PreparedMetaPackage[] = []
    for (const name of names) {
      const root = join(producer, "standard", name)
      await cp(join(repository, "standard", name), root, {recursive: true, filter: source => !["spec", "test", "node_modules", "dist"].some(part => source.split(/[\\/]/).at(-1) === part)})
      const dependencyRoot = join(repository, "standard", name, "node_modules")
      if (await lstat(dependencyRoot).then(() => true, error => {if (error.code === "ENOENT") return false; throw error}))
        await symlink(dependencyRoot, join(root, "node_modules"))
      const result = await prepareMetaPackage({root, address: `@metafor/${name}`, outdir: join(producer, "outputs", name),
        readDeclaration: async path => evaluateMetaSource(await Bun.file(path).text(), {sourcePath: path})})
      check(result.result.success, `Preparing ${name} failed at ${result.result.stage}: ${result.result.stderr}\n${result.result.stdout}`)
      prepared.push(result)
    }
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: prepared.map(packageGraph)}
    const digest = publishedReleaseGraphDigest(graph)
    const store = createInstalledReleaseStore({root: storeRoot})
    await store.prepare(graph, {async read(identity) {
      const owner = prepared.find(item => item.address === identity.name)
      const output = owner?.result.outputs.find(output => output.artifact === identity.artifact && output.sha256 === identity.sha256)
      if (!output) throw new Error("Prepared standard artifact is absent")
      return Bun.file(output.path).stream()
    }}, digest)
    const mapping = await createInstalledMetaMapping({store, digest, graph, knownRoots: names.map(name => `@metafor/${name}`)})
    const builds = await Promise.all([
      Bun.build({entrypoints: [join(import.meta.dir, "fixture/runtime.ts")], target: "bun", conditions: ["cosmos:server", "internal:server", "metafor:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]}),
      ...(provider === "fixture" ? [Bun.build({entrypoints: [join(repository, "standard/chat/test/fixture/agent.ts")], target: "bun"})] : []),
    ])
    for (const build of builds) check(build.success && build.outputs.length === 1, `Acceptance bundle failed: ${build.logs.map(String).join("\n")}`)
    const executable = join(directory, "quantum.mjs")
    await Bun.write(executable, builds[0]!.outputs[0]!)
    const fakeAgent = join(directory, "fake-acp.mjs")
    if (provider === "fixture") await Bun.write(fakeAgent, builds[1]!.outputs[0]!)
    const replyFile = join(directory, "replies.json")
    await Bun.write(replyFile, JSON.stringify([{operation: "scenario.run", scenario: "agent-system.integrity"}, {answer: firstAnswer},
      {operation: "scenario.run", scenario: "agent-system.integrity"}, {answer: secondAnswer}]))
    const fixtureStore = join(directory, "native-session.json")
    const command = provider === "fixture" ? [process.execPath, fakeAgent] : [...options.command!]
    await rm(producer, {recursive: true, force: true})
    check(!await Bun.file(join(producer, "standard/environment/meta.tsx")).exists(), "Producer declaration survived removal")
    const launch = () => launchInstalledAgentWorld({executable, directory, stateRoot, storeRoot, mapping, command, cwd: providerCwd,
      ...(provider === "fixture" ? {fixtureStore, replyFile} : {live: true})})
    const runs: {initialization: Ready["initialization"]; rootReads: number; identities: ReturnType<typeof identities>; answer: unknown;
      chat: Record<string, unknown>; provider: Record<string, unknown>; registry: Record<string, unknown>; scenario: Record<string, unknown>; agents: ReadAgentsReceipt;
      executions: MetaProcessExecutionReadReceipt[]; frontier: DarkForceHistoryReadReceipt["frontier"]}[] = []
    let updatedConfiguration = ""
    for (let index = 0; index < 2; index++) {
      world = await launch()
      check(world.ready.initialization.mode === (index === 0 ? "initialized" : "restored"), "Wrong initialization/restore mode")
      check(world.ready.rootReads === (index === 0 ? 1 : 0), "Restoration reopened the root source loader")
      const discoveryDeadline = Date.now() + 25_000
      for (;;) {
        const current = await world.call<Graph>("dark", READ_GRAPH_METHOD, {})
        const native = actor(current, "provider")
        check(native.values.bootstrapError === null, `Provider bootstrap failed: ${native.values.bootstrapError}`)
        if (native.values.bootstrapApplied === true && native.values.discoveryAck === true && native.values.discoveryAckId === "bootstrap-native") {
          check(native.values.discoveryError === null, `Provider discovery failed: ${native.values.discoveryError}`)
          const registry = jsonContent(await mass(world, current, "provider", "registry"))
          const entries = registry.entries as Array<{connection: string, checks: unknown}>
          check(entries[0]?.connection === "connected", `Provider initialization check failed: ${JSON.stringify(entries)}`)
          break
        }
        check(Date.now() < discoveryDeadline, "Provider discovery did not finish")
        await Bun.sleep(20)
      }
      if (provider === "fixture") {
        const exists = await Bun.file(fixtureStore).exists()
        check(index === 0 ? !exists : exists, "Finite startup checks changed native session lifetime")
        if (exists) check((JSON.parse(await readFile(fixtureStore, "utf8")) as {prompts: unknown[]}).prompts.length === 2, "Startup sent a model prompt")
      }
      if (index === 1) check(actor(world.ready.graph, "agent").values.configuration === updatedConfiguration, "Dynamic Agent configuration was not retained")
      const task = {id: `installed-agent-task-${index + 1}`, text: "Выполни разрешённый сценарий agent-system.integrity и сообщи подтверждённый результат."}
      await writeField(world, world.ready.graph, actor(world.ready.graph, "environment"), "task", JSON.stringify(task))
      const completed = await waitCompleted(world, task.id, provider === "live" ? 180_000 : 30_000)
      const chat = jsonContent(await mass(world, completed, "chat", "session"))
      const scenario = jsonContent(await mass(world, completed, "scenario", "result"))
      const nativeTurns = jsonContent(await mass(world, completed, "provider", "turns"))
      const registry = jsonContent(await mass(world, completed, "provider", "registry"))
      check(nativeTurns.sessionId === chat.sessionId && nativeTurns.providerRef === actor(completed, "provider").ref,
        "Provider and Chat disagree about the owning native session")
      const agents = await world.call<ReadAgentsReceipt>("dark", READ_AGENTS_METHOD, {})
      check(agents.agents.length === 1 && agents.agents[0]?.ref === actor(completed, "agent").ref, "Oracle Agent projection lost its identity")
      check(agents.agents[0]?.owner?.ref === actor(completed, "environment").ref, "Oracle Agent projection lost its owning Atom")
      check(agents.agents[0]?.configuration.resolution === "exact" && agents.agents[0]?.chat?.ref === actor(completed, "chat").ref,
        "Oracle Agent projection lost configuration or Chat")
      const executions = await processEvidence(world, completed)
      check(executions.every(execution => execution.status !== "pending"), "Completed task left pending Process execution")
      const answer = actor(completed, "environment").values.answer
      check(typeof answer === "string" && answer.length > 0, "Agent returned no final answer")
      if (provider === "fixture") check(answer === (index === 0 ? firstAnswer : secondAnswer), "Agent final answer differs from the native fixture answer")
      runs.push({initialization: world.ready.initialization, rootReads: world.ready.rootReads, identities: identities(completed), answer,
        chat, provider: nativeTurns, registry, scenario, agents, executions, frontier: (await history(world)).frontier})
      if (index === 0) {
        const agent = actor(completed, "agent")
        check(typeof agent.values.configuration === "string", "Agent configuration is not a canonical ordinary Field")
        const configuration = JSON.parse(agent.values.configuration) as Record<string, unknown>
        configuration.displays = [{id: "after-first-task", source: {kind: "graph"}}]
        updatedConfiguration = JSON.stringify(configuration)
        await writeField(world, completed, agent, "configuration", updatedConfiguration)
        const changed = await world.call<Graph>("dark", READ_GRAPH_METHOD, {})
        check(actor(changed, "agent").values.configuration === updatedConfiguration, "Dynamic Agent configuration did not commit")
        const projected = await world.call<ReadAgentsReceipt>("dark", READ_AGENTS_METHOD, {})
        check(projected.agents[0]?.configuration.value?.displays[0]?.id === "after-first-task", "Oracle Agent presentation projection is stale")
      }
      const children = world.ready.children.map(child => child.pid)
      const stopped = await world.close()
      check(stopped.code === 0, `Native Agent contour failed to close: ${stopped.stderr}`)
      for (const pid of children) {
        let alive = false
        try {process.kill(pid, 0); alive = true} catch {}
        check(!alive, "Native domain child survived owned contour close")
      }
      closedPids.push(...children)
      world = undefined
    }
    const native = provider === "fixture" ? JSON.parse(await readFile(fixtureStore, "utf8")) : undefined
    const report = {provider, directory, releaseDigest: digest, producerRemovedBeforeBirth: true, runs, updatedConfiguration, closedPids,
      ...(native ? {native} : {})}
    if (options.evidencePath) await Bun.write(options.evidencePath, `${JSON.stringify(report, null, 2)}\n`)
    return report
  } catch (error) {
    const stopped = await world?.close().catch(() => undefined)
    if (stopped?.stderr) throw new Error(`${error instanceof Error ? error.message : String(error)}\n${stopped.stderr.slice(-12000)}`, {cause: error})
    throw error
  } finally {
    await world?.close().catch(() => {})
    if (!options.keep) await rm(directory, {recursive: true, force: true})
  }
}
