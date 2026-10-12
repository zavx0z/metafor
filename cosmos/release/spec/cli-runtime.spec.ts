import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readdir, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {type BoundaryInitialProjection} from "shared/protocol/boundary/initial"
import {open as openBoundary} from "../../../quantum/boundary/sqlite"

type ProcessInfo = {pid: number, parent: number, command: string}
type Health = {ok: boolean, requiredDomains: string[], connectedDomains: string[], forceHistory: {path: string},
  domains: Record<string, {ok: boolean, database?: string, backend?: string}>,
  transport: {id: string, links: {peerId: string, state: string, transport: string, channels: {name: string, state: string}[]}[]}}

const alive = (pid: number) => {try {process.kill(pid, 0); return true} catch {return false}}
async function processes(): Promise<ProcessInfo[]> {
  const command = Bun.spawn(["ps", "-axo", "pid=,ppid=,command="], {stdout: "pipe", stderr: "pipe"})
  const output = await new Response(command.stdout).text()
  if (await command.exited !== 0) throw new Error("Cannot inspect the fixture process tree")
  return output.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line)
    return match ? [{pid: Number(match[1]), parent: Number(match[2]), command: match[3]!}] : []
  })
}
async function descendants(root: number) {
  const all = await processes()
  const parents = new Set([root])
  const result: ProcessInfo[] = []
  for (;;) {
    const next = all.filter(entry => !parents.has(entry.pid) && parents.has(entry.parent))
    if (!next.length) return result
    for (const entry of next) {parents.add(entry.pid); result.push(entry)}
  }
}
async function sockets(pids: readonly number[], kind: "udp" | "listener") {
  if (!pids.length) return []
  const command = Bun.spawn(["lsof", "-nP", "-a", "-p", pids.join(","),
    ...(kind === "udp" ? ["-iUDP"] : ["-iTCP", "-sTCP:LISTEN"]), "-Fn"], {stdout: "pipe", stderr: "pipe"})
  const output = await new Response(command.stdout).text()
  const code = await command.exited
  if (code !== 0 && code !== 1) throw new Error("Cannot inspect owned fixture sockets")
  return output.split("\n").filter(line => line.startsWith("n"))
}
async function domainOf(pid: number) {
  // Inspect only our fixture children; extract the domain label and never return their private credentials.
  const command = Bun.spawn(["ps", "eww", "-p", String(pid), "-o", "command="], {stdout: "pipe", stderr: "pipe"})
  const output = await new Response(command.stdout).text()
  await command.exited
  return /(?:^|\s)COSMOS_QUANTUM_DOMAIN=(boundary|energy|matrix)(?:\s|$)/u.exec(output)?.[1]
}
async function freePorts(count: number) {
  const reservations: Bun.Server<undefined>[] = []
  try {
    for (let index = 0; index < count; index++) {
      reservations.push(Bun.serve({port: 0, reusePort: false, fetch: () => new Response()}))
    }
    const ports = reservations.map(server => server.port!)
    if (new Set(ports).size !== count) throw new Error("Fixture port reservations overlap")
    return ports
  } finally {await Promise.all(reservations.map(server => server.stop(true)))}
}
const freePort = async () => (await freePorts(1))[0]!
async function stoppedProjection(data: string): Promise<BoundaryInitialProjection> {
  // The owning Boundary API is used only after its entire process tree has stopped.
  const boundary = await openBoundary(join(data, "dev.sqlite"))
  try {return await boundary.initialProjection()} finally {await boundary.close()}
}
async function stoppedCounts(data: string) {
  const boundary = await openBoundary(join(data, "dev.sqlite"))
  try {
    const state = await boundary.initialState()
    const root = state.atoms.find(atom => atom.wimp === "@fixture/root")
    if (!root) throw new Error("Stopped canonical root is missing")
    return Object.fromEntries(["starts", "stops"].map(key => {
      const field = state.declarations.find(item => item.src === "@fixture/root" && item.section === "fields" && item.value.key === key)
      return [key, root.values.find(value => value.field === field?.value.id)?.value]
    }))
  } finally {await boundary.close()}
}
async function acceptedNativeValues(data: string): Promise<unknown[]> {
  const directory = join(data, "dark-force-history", "v1", "segments")
  const values: unknown[] = []
  for (const name of await readdir(directory)) {
    const lines = (await Bun.file(join(directory, name)).text()).trim().split("\n")
    for (const line of lines) {
      const particle = JSON.parse(line).particle
      if (particle?.part === "gluon" && particle.by === "agent") values.push(...Object.values(particle.value?.fields ?? {}))
    }
  }
  return values
}
async function until<T>(read: () => Promise<T | undefined>, timeout: number, label: string): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await read()
    if (result !== undefined) return result
    await Bun.sleep(50)
  }
  throw new Error(`${label} timed out`)
}

/** Actual compiled CLI, installed release and four causal domains; no developer checkout at runtime. */
test("compiled CLI isolates instances, restores root Meta and owns failure cleanup", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-cli-runtime-")))
  const cli = join(directory, "metafor.mjs")
  const codeRoot = join(directory, "shipment")
  const foreign = join(directory, "foreign")
  const active = new Set<ReturnType<typeof launch>>()
  const observed = new Map<number, string>()
  const builds = await Promise.all([
    Bun.build({entrypoints: [resolve(import.meta.dir, "../../cli.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"]}),
    Bun.build({entrypoints: [resolve(import.meta.dir, "../server/index.ts")], target: "bun",
      conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]}),
  ])
  for (const build of builds) {
    expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
    expect(build.outputs).toHaveLength(1)
  }
  await Bun.write(cli, builds[0]!.outputs[0]!)
  const serverBytes = new Uint8Array(await builds[1]!.outputs[0]!.arrayBuffer())
  const integrity = await artifactIntegrity(serverBytes.buffer)
  const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: "@cosmos/release", version: "91.0.0", dependencies: {},
    environments: [{env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript;charset=utf-8", ...integrity}]}]}]}
  const digest = publishedReleaseGraphDigest(graph)
  await createInstalledReleaseStore({root: join(codeRoot, "release")}).prepare(graph, {async read() {return serverBytes}}, digest)
  const initialPorts = await freePorts(2)
  const assignments = await Promise.all(["left", "right"].map(async (name, index) => {
    const data = join(directory, `data-${name}`)
    const meta = join(directory, `sources-${name}`, "project")
    const child = join(meta, "parts", "child")
    await mkdir(child, {recursive: true})
    await Bun.write(join(meta, "package.json"), JSON.stringify({name: "@fixture/root", workspaces: ["parts/*"], dependencies: {"@fixture/child": "workspace:*"}}))
    await Bun.write(join(child, "package.json"), JSON.stringify({name: "@fixture/child"}))
    await Bun.write(join(meta, "meta.ts"), `export default MetaFor("CLI ${name}")
.fields(field => ({title: field.string.required("${name}"), input: field.string.optional(), starts: field.number.required(0), stops: field.number.required(0)}))
.lifecycle({started: {field: "input", value: "native-started-${name}"}, stopping: {field: "input", value: "native-stopping-${name}"}})
.superposition({waiting: {starting: {input: {eq: "native-started-${name}"}}}, starting: {ready: {input: {null: true}}}, ready: {starting: {input: {eq: "native-started-${name}"}}, stopping: {input: {eq: "native-stopping-${name}"}}}, stopping: {stopped: {input: {null: true}}}, stopped: {starting: {input: {eq: "native-started-${name}"}}}})
.mass(() => ({})).energy().processes(process => [
  process("starting", {env: ["server"]}).action(async ({value}) => {const mod = await import("./process/starting/index.ts"); return mod.default({value})}).success(({update,data}) => update({input: null, starts: data.count})),
  process("stopping", {env: ["server"]}).action(async ({value}) => {const mod = await import("./process/stopping/index.ts"); return mod.default({value})}).success(({update,data}) => update({input: null, stops: data.count}))
]).reactions(() => [])
.matter(({html}) => html\`<meta-for src="@fixture/child" />\`).bulk()\n`)
    for (const [state, field] of [["starting", "starts"], ["stopping", "stops"]]) {
      const action = join(meta, "process", state!)
      await mkdir(action, {recursive: true})
      await Bun.write(join(action, "package.json"), JSON.stringify({name: `@fixture/${state}`, type: "module", exports: {".": "./index.ts"}}))
      const delay = name === "left" && state === "stopping" ? "await Bun.sleep(5500); " : ""
      await Bun.write(join(action, "index.ts"), `export default async ({value}) => {${delay}return {count: value.${field}+1}}`)
    }
    await Bun.write(join(child, "meta.ts"), 'export default MetaFor("CLI child").fields(() => ({})).superposition({ready: null}).mass(() => ({})).energy().processes(() => []).reactions(() => []).matter(({html}) => html``).bulk()\n')
    return {name, data, meta, child, port: initialPorts[index]!}
  }))
  function launch(data: string, port: number, initial?: string, restore = false) {
    const args = [process.execPath, cli, "--port", String(port), "--data-dir", data,
      ...(initial ? ["--meta-root", initial] : []),
      ...(initial && !restore ? ["--release", digest, "--code-dir", codeRoot] : [])]
    const child = Bun.spawn(args, {cwd: directory, env: {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, METAFOR_WEAK_BACKEND: "cpu",
      COSMOS_QUANTUM_DOMAIN: "bogus-inherited-domain", COSMOS_QUANTUM: "0", COSMOS_NODE_CONFIG: join(foreign, "node.json"),
      COSMOS_PEER_TOKEN: "test-only-inherited-token", METAFOR_STATE_ROOT: foreign, METAFOR_MASS_PATH: join(foreign, "mass"),
      BOUNDARY_PATH: join(foreign, "dev.sqlite"), DARK_FORCE_HISTORY_PATH: join(foreign, "history"),
      DARK_CHECKPOINT_CONTROL_PATH: join(foreign, "checkpoint.json"), METAFOR_ROOT_META: join(foreign, "meta.ts"),
      METAFOR_META_SOURCE_ROOT: foreign, METAFOR_META_ARTIFACT_ROOT: foreign, METAFOR_META_ARTIFACT_MAP: "invalid inherited JSON",
      METAFOR_META_ARTIFACT_MAP_FILE: join(foreign, "map.json"), METAFOR_ROOT_SOURCES: "bogus/inherited",
    }, stdout: "pipe", stderr: "pipe"})
    let stdoutText = ""
    let stderrText = ""
    const stdout = (async () => {for await (const bytes of child.stdout) stdoutText += new TextDecoder().decode(bytes); return stdoutText})()
    const stderr = (async () => {for await (const bytes of child.stderr) stderrText += new TextDecoder().decode(bytes); return stderrText})()
    const origin = `http://127.0.0.1:${port}`
    const session = {child, origin, data, async ready() {
      return await until(async () => {
        await session.inventory()
        if (child.exitCode !== null) throw new Error(`CLI exited ${child.exitCode}: ${stderrText.slice(0, 2000)}\n${stdoutText.slice(-2000)}`)
        const selected = await createInstalledReleaseStore({root: join(data, "store")}).readActive()
        if (selected?.digest !== digest) return
        const response = await fetch(`${origin}/health`).catch(() => undefined)
        if (!response?.ok) return
        const health = await response.json() as Health
        return health.ok ? health : undefined
      }, 30_000, "CLI readiness").catch(error => {throw new Error(`${error.message}\n${stderrText.slice(-2000)}\n${stdoutText.slice(-2000)}`)})
    }, async inventory() {
      const entries = await descendants(child.pid)
      for (const entry of entries) observed.set(entry.pid, entry.command)
      return entries
    }, async exited() {
      const deadline = Date.now() + 30_000
      while (child.exitCode === null && Date.now() < deadline) {await session.inventory(); await Bun.sleep(25)}
      if (child.exitCode === null) throw new Error(`CLI exit timed out\nOwned: ${JSON.stringify(await session.inventory())}\n${stderrText.slice(-2000)}\n${stdoutText.slice(-2000)}`)
      await child.exited
      active.delete(session)
      return {code: child.exitCode, stdout: (await stdout).slice(-4000), stderr: (await stderr).slice(-4000)}
    }, async stop() {
      const owned = await session.inventory()
      const started = Date.now()
      child.kill("SIGTERM")
      const result = await session.exited()
      expect(result.code, result.stderr).toBe(0)
      await until(async () => owned.every(entry => !alive(entry.pid)) ? true : undefined, 10_000, "Owned child cleanup")
      return Date.now() - started
    }}
    active.add(session)
    return session
  }
  try {
    const initial = assignments.map(item => launch(item.data, item.port, join(item.meta, "meta.ts")))
    const health = await Promise.all(initial.map(session => session.ready()))
    for (const [index, session] of initial.entries()) {
      const assignment = assignments[index]!
      expect(health[index]!.requiredDomains).toEqual(["dark", "boundary", "matrix", "energy"])
      expect(health[index]!.connectedDomains).toEqual(health[index]!.requiredDomains)
      expect(health[index]!.domains.boundary?.database).toBe(join(assignment.data, "dev.sqlite"))
      expect(health[index]!.domains.matrix?.backend).toBe("cpu")
      expect(health[index]!.forceHistory.path).toBe(join(assignment.data, "dark-force-history", "v1"))
      const links = health[index]!.transport.links
      expect(links).toHaveLength(3)
      expect(links.every(link => link.state === "open" && link.transport === "direct")).toBeTrue()
      for (const link of links) expect(link.channels).toEqual([{name: "oracle", state: "open"}, {name: "force", state: "open"}])
      for (const route of ["/ws?domain=energy&id=legacy", "/oracle/ws?identity=energy&id=legacy", "/oracle/channels"]) {
        const response = await fetch(`${session.origin}${route}`, route === "/oracle/channels" ? {method: "POST", body: "{}"} : {})
        expect(response.status).toBe(403)
      }
      const owned = await session.inventory()
      expect(owned).toHaveLength(4)
      const pids = owned.map(entry => entry.pid)
      expect((await sockets(pids, "udp")).length).toBeGreaterThan(0)
      expect(await sockets(pids, "listener")).toHaveLength(1)
      const domains = await Promise.all(owned.map(entry => domainOf(entry.pid)))
      expect(domains.filter(Boolean).sort()).toEqual(["boundary", "energy", "matrix"])
      expect(owned.every(entry => entry.command.includes(join(assignment.data, "store")))).toBeTrue()
    }
    const duplicate = launch(assignments[0]!.data, await freePort())
    const rejected = await duplicate.exited()
    expect(rejected.code).not.toBe(0)
    expect(rejected.stderr).toContain("live launcher")
    expect((await fetch(`${initial[0]!.origin}/health`).then(response => response.json()) as Health).ok).toBeTrue()
    const stoppingTimes = await Promise.all(initial.map(session => session.stop()))
    // Real declared Meta work outlives the old 5s parent budget and commits before exit.
    expect(stoppingTimes[0], JSON.stringify(await stoppedCounts(assignments[0]!.data))).toBeGreaterThanOrEqual(5500)
    expect(await sockets([...observed.keys()], "udp")).toEqual([])
    const worlds = await Promise.all(assignments.map(async item => {
      expect(await acceptedNativeValues(item.data)).toContain(`native-stopping-${item.name}`)
      const world = await stoppedProjection(item.data)
      expect(world.entries.filter(entry => entry.path === "wimp").map(entry => (entry.value as {src: string}).src).sort()).toEqual(["@fixture/child", "@fixture/root"])
      expect(JSON.stringify(world)).toContain(`CLI ${item.name}`)
      expect(await stoppedCounts(item.data)).toEqual({starts: 1, stops: 1})
      return world
    }))
    await rm(codeRoot, {recursive: true, force: true})
    // Source declarations remain prepared locally for current Graph assembly.
    const restarted = assignments.map(item => launch(item.data, item.port, join(item.meta, "meta.ts"), true))
    await Promise.all(restarted.map(session => session.ready()))
    for (const [index, session] of restarted.entries()) {
      expect((await session.ready()).transport.links.every(link => link.transport === "direct")).toBeTrue()
      expect((await createInstalledReleaseStore({root: join(session.data, "store")}).readActive())?.digest).toBe(digest)
    }
    await restarted[1]!.stop()
    const restoredWorld = await stoppedProjection(assignments[1]!.data)
    expect(restoredWorld.entries.filter(entry => entry.path === "wimp")).toEqual(worlds[1]!.entries.filter(entry => entry.path === "wimp"))
    expect(await stoppedCounts(assignments[1]!.data)).toEqual({starts: 2, stops: 2})
    const occupied = Bun.serve({port: 0, reusePort: false, fetch: () => new Response("fixture occupied")})
    try {
      const collision = launch(assignments[1]!.data, occupied.port!)
      const result = await collision.exited()
      expect(result.code).not.toBe(0)
      expect(await fetch(`http://127.0.0.1:${occupied.port}`).then(response => response.text())).toBe("fixture occupied")
      const leftovers = (await processes()).filter(entry => entry.command.includes(join(assignments[1]!.data, "store")))
      expect(leftovers).toEqual([])
    } finally {await occupied.stop(true)}
    const victim = restarted[0]!
    const owned = await victim.inventory()
    const labeled = await Promise.all(owned.map(async entry => ({...entry, domain: await domainOf(entry.pid)})))
    const energy = labeled.find(entry => entry.domain === "energy")
    expect(energy).toBeDefined()
    process.kill(energy!.pid, "SIGKILL")
    const failure = await victim.exited()
    expect(failure.code).not.toBe(0)
    await until(async () => owned.every(entry => !alive(entry.pid)) ? true : undefined, 10_000, "Failed contour cleanup")
    const reusable = launch(assignments[0]!.data, assignments[0]!.port, join(assignments[0]!.meta, "meta.ts"), true)
    expect((await reusable.ready()).ok).toBeTrue()
    await reusable.stop()
    const recoveredWorld = await stoppedProjection(assignments[0]!.data)
    expect(recoveredWorld.entries.filter(entry => entry.path === "wimp")).toEqual(worlds[0]!.entries.filter(entry => entry.path === "wimp"))
    expect(await stoppedCounts(assignments[0]!.data)).toEqual({starts: 3, stops: 2})
    expect(await Bun.file(join(foreign, "dev.sqlite")).exists()).toBeFalse()
    expect(await Bun.file(join(foreign, "history", "manifest.json")).exists()).toBeFalse()
    expect(await Bun.file(join(foreign, "checkpoint.json")).exists()).toBeFalse()
  } finally {
    for (const session of active) if (session.child.exitCode === null) session.child.kill("SIGTERM")
    await Promise.all([...active].map(async session => {
      await Promise.race([session.child.exited, Bun.sleep(15_000)])
      if (session.child.exitCode === null) {session.child.kill("SIGKILL"); await session.child.exited}
    }))
    for (const entry of await processes()) if (observed.has(entry.pid) && entry.command === observed.get(entry.pid) && entry.command.includes(directory)) {
      try {process.kill(entry.pid, "SIGKILL")} catch {}
    }
    await rm(directory, {recursive: true, force: true})
  }
}, 180_000)
