import {expect, test} from "bun:test"
import {mkdtemp, mkdir, readFile, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"

type Ready = {type: "ready", origin: string, health: {ok: boolean, externalAdmission: string, requiredDomains: string[], connectedDomains: string[], domains: Record<string, {ok: boolean, backend?: string}>}, children: {domain: string, pid: number, executable: string, cwd: string}[], quiesceRefusal: {code: string, message: string} | null}

/** Реальные домены исполняют один bundled artifact в изолированном persistent state. */
test("one compiled release births four domains without Bulk, closes owned children and restores the same state", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-quantum-release-")))
  const executable = join(directory, "release.mjs")
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "meta-artifacts")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  await Bun.write(join(artifacts, "meta.mjs"), 'export default {name: "Compiled fixture", fields: [], superposition: [], processes: [], reactions: [], mass: [], matter: []}\n')
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"],
  })
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  expect(build.outputs).toHaveLength(1)
  await Bun.write(executable, build.outputs[0]!)
  let child: ReturnType<typeof Bun.spawn> | undefined
  let initialManifest: string | undefined
  try {
    for (let run = 0; run < 2; run++) {
      await Promise.all(["boundary", "energy", "matrix"].map(domain => rm(join(stateRoot, `fixture-${domain}.json`), {force: true})))
      const ready = Promise.withResolvers<Ready>()
      const closed = Promise.withResolvers<void>()
      const quiesced = Promise.withResolvers<{ownHeld: string, ownResumed: string, borrowedAdmission: string, before: unknown, after: unknown}>()
      child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env,
        QUANTUM_FIXTURE_STATE: stateRoot, METAFOR_WEAK_BACKEND: "cpu", METAFOR_MASS_PATH: join(stateRoot, "mass"),
        DARK_FORCE_HISTORY_PATH: undefined, DARK_CHECKPOINT_CONTROL_PATH: undefined, DARK_FORCE_HISTORY_CUT_ID: undefined,
        DARK_FORCE_HISTORY_STARTED_AT: undefined, DARK_CHECKPOINT_SIDEBAND: "1",
        META_AUTHORING_RPC_SOURCE: undefined, META_AUTHORING_SCOPES: undefined, META_AUTHORING_CREATE_SCOPES: undefined,
        METAFOR_ROOT_SOURCES: undefined, COSMOS_QUANTUM_DOMAIN: undefined,
        METAFOR_META_SOURCE_ROOT: undefined, METAFOR_META_ARTIFACT_ROOT: artifacts,
        METAFOR_META_ARTIFACT_MAP_FILE: undefined,
        METAFOR_META_ARTIFACT_MAP: JSON.stringify({"fixture/quantum": {directory: ".", entry: "meta.mjs"}}),
      }, stdout: "pipe", stderr: "pipe", ipc(message) {
        if (message && typeof message === "object" && "type" in message) {
          if (message.type === "ready") ready.resolve(message as Ready)
          if (message.type === "closed") closed.resolve()
          if (message.type === "quiesced") quiesced.resolve(message as never)
          if (message.type === "case-failed") quiesced.reject(new Error(String((message as {message: unknown}).message)))
        }
      }})
      const current = child
      if (!(current.stderr instanceof ReadableStream) || !(current.stdout instanceof ReadableStream)) throw new Error("Fixture process pipes are unavailable")
      const stderr = new Response(current.stderr).text()
      const stdout = new Response(current.stdout).text()
      const result = await Promise.race([ready.promise, current.exited.then(async code => {throw new Error(`Quantum fixture exited ${code}: ${await stderr}\n${await stdout}`)}),
        Bun.sleep(20_000).then(() => {throw new Error("Quantum release fixture readiness timed out")}),
      ])
      expect(result.health.ok).toBeTrue()
      expect(result.quiesceRefusal).toBeNull()
      expect(result.health.externalAdmission).toBe("open")
      expect(result.health.requiredDomains).toEqual(["dark", "boundary", "matrix", "energy"])
      expect(result.health.connectedDomains).toEqual(result.health.requiredDomains)
      expect(Object.keys(result.health.domains).sort()).toEqual(["boundary", "energy", "matrix"])
      expect(result.health.domains.matrix?.backend).toBe("cpu")
      expect(result.children.map(entry => entry.domain)).toEqual(["boundary", "energy", "matrix"])
      for (const process of result.children) {
        expect(process.executable).toBe(executable)
        expect(process.cwd).toBe(stateRoot)
      }
      const manifest = await readFile(join(stateRoot, "dark-force-history/v1/manifest.json"), "utf8")
      if (run === 0) initialManifest = manifest
      else expect(manifest).toBe(initialManifest!)
      if (run === 0) {
        current.send("seed-quiesce")
        const held = await Promise.race([quiesced.promise, Bun.sleep(10_000).then(() => {throw new Error("Seeded causal quiesce timed out")})])
        expect(held.ownHeld).toBe("closed")
        expect(held.ownResumed).toBe("open")
        expect(held.borrowedAdmission).toBe("closed")
        expect(held.after).toEqual(held.before)
      }
      current.send(run === 0 ? "hold-and-stop" : "stop")
      await Promise.race([closed.promise, Bun.sleep(10_000).then(() => {throw new Error("Owned domain cleanup timed out")})])
      await current.exited
      expect(current.exitCode, await stderr).toBe(0)
      for (const process of result.children) expect(() => globalThis.process.kill(process.pid, 0)).toThrow()
      child = undefined
    }
  } finally {
    if (child?.exitCode === null) {child.send("stop"); await Promise.race([child.exited, Bun.sleep(8000)]); if (child.exitCode === null) child.kill("SIGKILL"); await child.exited}
    await rm(directory, {recursive: true, force: true})
  }
}, 60_000)

test("two compiled four-domain instances isolate all persistent data despite inherited path overrides", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-quantum-isolation-")))
  const executable = join(directory, "release.mjs")
  const foreignRoot = join(directory, "foreign")
  const stateRoots = [join(directory, "left"), join(directory, "right")]
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"],
  })
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  const running = new Set<ReturnType<typeof Bun.spawn>>()
  const start = async (stateRoot: string, value: string) => {
    await mkdir(stateRoot, {recursive: true})
    await Promise.all(["boundary", "energy", "matrix"].map(domain => rm(join(stateRoot, `fixture-${domain}.json`), {force: true})))
    const ready = Promise.withResolvers<Ready>()
    const child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env,
      QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_MASS_VALUE: value,
      COSMOS_QUANTUM: "1", COSMOS_QUANTUM_DOMAIN: undefined, METAFOR_WEAK_BACKEND: "cpu",
      METAFOR_STATE_ROOT: foreignRoot, METAFOR_MASS_PATH: join(foreignRoot, "mass"),
      BOUNDARY_PATH: join(foreignRoot, "dev.sqlite"), DARK_FORCE_HISTORY_PATH: join(foreignRoot, "history"),
      DARK_CHECKPOINT_CONTROL_PATH: join(foreignRoot, "control.json"),
      DARK_FORCE_HISTORY_CUT_ID: "inherited-foreign-cut", DARK_FORCE_HISTORY_STARTED_AT: "2000-01-01T00:00:00.000Z",
      DARK_CHECKPOINT_SIDEBAND: "0", META_AUTHORING_RPC_SOURCE: undefined,
      META_AUTHORING_SCOPES: undefined, META_AUTHORING_CREATE_SCOPES: undefined,
      METAFOR_ROOT_SOURCES: undefined, METAFOR_META_SOURCE_ROOT: undefined,
      METAFOR_META_ARTIFACT_ROOT: undefined, METAFOR_META_ARTIFACT_MAP_FILE: undefined, METAFOR_META_ARTIFACT_MAP: undefined,
    }, stdout: "pipe", stderr: "pipe", ipc(message) {
      if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as Ready)
    }})
    running.add(child)
    if (!(child.stderr instanceof ReadableStream) || !(child.stdout instanceof ReadableStream)) throw new Error("Fixture pipes are unavailable")
    const stderr = new Response(child.stderr).text()
    const stdout = new Response(child.stdout).text()
    const evidence = await Promise.race([ready.promise,
      child.exited.then(async code => {throw new Error(`Isolated Quantum exited ${code}: ${await stderr}\n${await stdout}`)}),
      Bun.sleep(20_000).then(() => {throw new Error("Isolated Quantum readiness timed out")}),
    ])
    return {child, evidence, async stop() {
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(10_000).then(() => {throw new Error("Isolated Quantum cleanup timed out")})])
      expect(child.exitCode, await stderr).toBe(0)
      for (const entry of evidence.children) expect(() => process.kill(entry.pid, 0)).toThrow()
      running.delete(child)
    }}
  }
  try {
    const manifests = new Map<string, string>()
    for (let run = 0; run < 2; run++) {
      const pair = await Promise.all(stateRoots.map((root, index) => start(root, run === 0 ? `instance-${index}` : "must-not-replace-persisted-bytes")))
      expect(pair[0]!.evidence.origin).not.toBe(pair[1]!.evidence.origin)
      for (const [index, session] of pair.entries()) {
        const root = stateRoots[index]!
        const health = session.evidence.health as Ready["health"] & {forceHistory: {path: string, cutId: string}}
        expect(health.ok).toBeTrue()
        expect(health.requiredDomains).toEqual(["dark", "boundary", "matrix", "energy"])
        expect(health.domains.matrix?.backend).toBe("cpu")
        expect((health.domains.boundary as {database?: string}).database).toBe(join(root, "dev.sqlite"))
        expect(health.forceHistory.path).toBe(join(root, "dark-force-history", "v1"))
        expect(health.forceHistory.cutId).not.toBe("inherited-foreign-cut")
        expect(await Bun.file(join(root, "checkpoint-control", "v1", "state.json")).exists()).toBeTrue()
        for (const entry of session.evidence.children) {
          expect(entry.cwd).toBe(root)
          expect(entry.executable).toBe(executable)
          if (entry.domain === "boundary" || entry.domain === "energy") expect((entry as {massRoot?: string}).massRoot).toBe(join(root, "mass"))
          if (entry.domain === "energy") expect((entry as {massValue?: string}).massValue).toBe(`instance-${index}`)
        }
        expect(await Bun.file(join(root, "mass", "11111111-1111-4111-8111-111111111111.bin")).text()).toBe(`instance-${index}`)
        const manifest = await readFile(join(root, "dark-force-history", "v1", "manifest.json"), "utf8")
        if (run === 0) manifests.set(root, manifest)
        else expect(manifest).toBe(manifests.get(root)!)
      }
      await Promise.all(pair.map(session => session.stop()))
      expect(await Bun.file(join(foreignRoot, "dev.sqlite")).exists()).toBeFalse()
      expect(await Bun.file(join(foreignRoot, "control.json")).exists()).toBeFalse()
      expect(await Bun.file(join(foreignRoot, "history", "manifest.json")).exists()).toBeFalse()
      expect(await Bun.file(join(foreignRoot, "mass", "11111111-1111-4111-8111-111111111111.bin")).exists()).toBeFalse()
    }
  } finally {
    await Promise.all([...running].map(async child => {
      if (child.exitCode !== null) return
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(8000)])
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }))
    await rm(directory, {recursive: true, force: true})
  }
}, 60_000)

test("completed first root import restores Boundary without reopening a removed source graph", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-quantum-first-root-")))
  const executable = join(directory, "release.mjs")
  const stateRoot = join(directory, "state")
  const rootFile = join(directory, "root.json")
  const childFile = join(directory, "child.json")
  const empty = {name: "Fixture child", fields: [], superposition: [], processes: [], reactions: [], mass: [], matter: []}
  await mkdir(stateRoot)
  await Bun.write(rootFile, JSON.stringify({...empty, name: "Fixture root", matter: [{kind: "wimp", src: "fixture/child"}]}))
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"],
  })
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  type InitializedReady = Ready & {initialization: {mode: string}, rootReads: number, sourceReads: number,
    world: {state: unknown, projection: {entries: {path: string, value?: {src?: string}}[]}}}
  const running = new Set<ReturnType<typeof Bun.spawn>>()
  const spawn = () => {
    const ready = Promise.withResolvers<InitializedReady>()
    const child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env,
      QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile,
      QUANTUM_FIXTURE_MASS_VALUE: undefined, COSMOS_QUANTUM: "1", COSMOS_QUANTUM_DOMAIN: undefined,
      METAFOR_WEAK_BACKEND: "cpu", META_AUTHORING_RPC_SOURCE: undefined, META_AUTHORING_SCOPES: undefined,
      META_AUTHORING_CREATE_SCOPES: undefined, METAFOR_ROOT_SOURCES: undefined,
      METAFOR_META_SOURCE_ROOT: undefined, METAFOR_META_ARTIFACT_ROOT: undefined,
      METAFOR_META_ARTIFACT_MAP_FILE: undefined, METAFOR_META_ARTIFACT_MAP: undefined,
    }, stdout: "pipe", stderr: "pipe", ipc(message) {
      if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as InitializedReady)
    }})
    running.add(child)
    if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) throw new Error("Initialization fixture pipes are unavailable")
    const stderr = new Response(child.stderr).text()
    const stdout = new Response(child.stdout).text()
    return {child, stderr, async ready() {return await Promise.race([ready.promise,
      child.exited.then(async code => {throw new Error(`Root fixture exited ${code}: ${await stderr}\n${await stdout}`)}),
      Bun.sleep(20_000).then(() => {throw new Error("Root fixture readiness timed out")}),
    ])}, async stop() {
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(10_000).then(() => {throw new Error("Root fixture cleanup timed out")})])
      expect(child.exitCode, await stderr).toBe(0)
      running.delete(child)
    }}
  }
  try {
    const failed = spawn()
    expect(await failed.child.exited).toBe(1)
    expect(await failed.stderr).toContain("child.json")
    running.delete(failed.child)
    const catalogFile = join(stateRoot, "dark-force-history", "v1", "catalog.json")
    const initialCatalog = await Bun.file(catalogFile).json()
    expect(initialCatalog.segments).toEqual([])
    await Bun.write(childFile, JSON.stringify(empty))
    const first = spawn()
    const initialized = await first.ready()
    expect(initialized.initialization.mode).toBe("initialized")
    expect(initialized.rootReads).toBe(1)
    expect(initialized.sourceReads).toBe(2)
    expect(initialized.world.projection.entries.filter(entry => entry.path === "wimp").map(entry => entry.value?.src).sort()).toEqual(["fixture/child", "fixture/initialized"])
    await first.stop()
    const firstCatalog = await Bun.file(catalogFile).text()
    await rm(rootFile)
    await rm(childFile)
    const second = spawn()
    const restored = await second.ready()
    expect(restored.initialization.mode).toBe("restored")
    expect(restored.rootReads).toBe(0)
    expect(restored.sourceReads).toBe(0)
    expect(restored.world).toEqual(initialized.world)
    expect(await Bun.file(catalogFile).text()).toBe(firstCatalog)
    await second.stop()
  } finally {
    await Promise.all([...running].map(async child => {
      if (child.exitCode !== null) return
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(8000)])
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }))
    await rm(directory, {recursive: true, force: true})
  }
}, 60_000)

test("trusted initial Root Fields preflight before started and are never read or replayed on restoration", async () => {
  const {evaluateMetaSource} = await import("../../../quantum/dark/load")
  const {open} = await import("../../../quantum/boundary/sqlite")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-initial-root-fields-")))
  const executable = join(directory, "release.mjs")
  const artifacts = join(directory, "meta")
  const rootFile = join(artifacts, "root.json")
  const inputFile = join(directory, "initial-fields.json")
  const processes = new Set<ReturnType<typeof Bun.spawn>>()
  await mkdir(join(artifacts, "process/start"), {recursive: true})
  const declaration = await evaluateMetaSource(`export default MetaFor("Initial fields")
    .fields(field => ({input: field.string.optional(), configuration: field.string.optional(), label: field.string.required("seed"), seen: field.string.optional(), starts: field.number.required(0)}))
    .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
    .superposition({waiting: {starting: {input: {eq: "started"}}}, starting: {ready: {input: {null: true}}}, ready: {starting: {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}}, stopped: {starting: {input: {eq: "started"}}}})
    .mass(() => ({})).energy().processes(process => [process("starting", {env: ["server"]})
      .action(async ({value}) => {const action = await import("./process/start/index.mjs"); return action.default({value})})
      .success(({update,data}) => update({seen: data.seen, starts: data.starts, input: null}))])
    .reactions().matter().bulk()`)
  await Bun.write(rootFile, JSON.stringify(declaration))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(declaration)}`)
  await Bun.write(join(artifacts, "process/start/index.mjs"), "export default async ({value}) => ({seen:value.configuration,starts:value.starts+1})")
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  type InitialReady = Ready & {initialization: {mode: string}, initialFieldReads: number, initialFieldsRefusal: string,
    rootReads: number, sourceReads: number, world: {state: import("shared/protocol/boundary/initial").BoundaryInitialState}}
  const values = (state: import("shared/protocol/boundary/initial").BoundaryInitialState) => {
    const root = state.atoms.find(atom => atom.wimp === "fixture/initialized")!
    return Object.fromEntries(state.declarations.filter(item => item.src === root.wimp && item.section === "fields")
      .map(item => [item.value.key, root.values.find(value => value.field === item.value.id)?.value]))
  }
  const spawn = async (stateRoot: string) => {
    await mkdir(stateRoot, {recursive: true})
    const ready = Promise.withResolvers<InitialReady>()
    const child = Bun.spawn([process.execPath, executable], {cwd: directory, env: {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, METAFOR_WEAK_BACKEND: "cpu",
      QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile,
      QUANTUM_FIXTURE_INITIAL_FIELDS_FILE: inputFile, QUANTUM_FIXTURE_PEER: "1",
      METAFOR_META_ARTIFACT_ROOT: artifacts,
      METAFOR_META_ARTIFACT_MAP: JSON.stringify({"fixture/initialized": {directory: ".", entry: "meta.mjs"}}),
    }, stdout: "pipe", stderr: "pipe", ipc(message) {
      if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as InitialReady)
    }})
    processes.add(child)
    const stderr = new Response(child.stderr).text()
    const stdout = new Response(child.stdout).text()
    const exited = async () => {
      await Promise.race([child.exited, Bun.sleep(30_000).then(() => {throw new Error("Initial Field fixture exit timed out")})])
      processes.delete(child)
      return {code: child.exitCode, stderr: await stderr, stdout: await stdout}
    }
    return {child, exited, async ready() {return Promise.race([ready.promise,
      exited().then(result => {throw new Error(`Initial Field fixture exited ${result.code}: ${result.stderr}\n${result.stdout}`)}),
    ])}, async stop() {child.send("stop"); const result = await exited(); expect(result.code, result.stderr).toBe(0)}}
  }
  try {
    for (const [index, invalid] of [{missing: "bad"}, {configuration: 42}, {input: "started"}].entries()) {
      await Bun.write(inputFile, JSON.stringify({label: "must-not-apply", ...invalid}))
      const stateRoot = join(directory, `invalid-${index}`)
      const failed = await spawn(stateRoot)
      expect((await failed.exited()).code).toBe(1)
      const boundary = await open(join(stateRoot, "dev.sqlite"))
      try {expect(values(await boundary.initialState())).toMatchObject({label: "seed", configuration: null, seen: null, starts: 0, input: null})}
      finally {await boundary.close()}
    }
    await Bun.write(inputFile, JSON.stringify({label: "configured", configuration: "receiver-intent"}))
    const stateRoot = join(directory, "valid")
    const first = await spawn(stateRoot)
    const initialized = await first.ready()
    expect(initialized.initialization.mode).toBe("initialized")
    expect(initialized.initialFieldReads).toBe(1)
    expect(initialized.initialFieldsRefusal).toContain("unused fresh root")
    expect(values(initialized.world.state)).toMatchObject({label: "configured", configuration: "receiver-intent", seen: "receiver-intent", starts: 1})
    await first.stop()
    await rm(rootFile)
    await rm(inputFile)
    const second = await spawn(stateRoot)
    const restored = await second.ready()
    expect(restored.initialization.mode).toBe("restored")
    expect(restored.initialFieldReads).toBe(0)
    expect(restored.rootReads).toBe(0)
    expect(restored.sourceReads).toBe(0)
    expect(restored.initialFieldsRefusal).toContain("unused fresh root")
    expect(values(restored.world.state)).toMatchObject({label: "configured", configuration: "receiver-intent", seen: "receiver-intent", starts: 2})
    await second.stop()
  } finally {
    for (const child of processes) {
      if (child.exitCode === null) {child.send("stop"); await Promise.race([child.exited, Bun.sleep(8000)])}
      if (child.exitCode === null) {child.kill("SIGKILL"); await child.exited}
    }
    await rm(directory, {recursive: true, force: true})
  }
}, 120_000)

test("saved Meta lifecycle recreates its resource without source reevaluation or external binding override", async () => {
  const {evaluateMetaSource} = await import("../../../quantum/dark/load")
  const {OracleRpcPeer, OracleTransport} = await import("shared/transport/oracle")
  const {READ_GRAPH_METHOD} = await import("@metafor/types/metafor/graph")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-root-lifecycle-")))
  const executable = join(directory, "release.mjs")
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "meta")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  const source = `export default MetaFor("Lifecycle fixture")
.fields(field => ({input: field.string.optional(), installed: field.boolean.required(false), port: field.number.optional(), error: field.string.optional(), oneshots: field.number.required(0), starts: field.number.required(0), stops: field.number.required(0), resourcePid: field.number.optional()}))
.lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
.superposition({
  waiting: {install: {input: {eq: "started"}, installed: {eq: false}}, reconcile: {input: {eq: "started"}, installed: {eq: true}}},
  install: {reconcile: {installed: {eq: true}}},
  reconcile: {ready: {input: {null: true}}},
  ready: {reconcile: {input: {eq: "started"}}, stopping: {input: {eq: "stopping"}}},
  stopping: {stopped: {input: {null: true}}},
  stopped: {reconcile: {input: {eq: "started"}}}
})
.mass(() => ({})).energy<{resource: Bun.Server<undefined>}>()
.processes(process => [
  process("install", {env: ["server"]}).action(async ({value}) => {const mod = await import("./process/install/index.mjs"); return mod.default({value})})
    .success(({update,data}) => update({installed: true, oneshots: data.oneshots})),
  process("reconcile", {env: ["server"]}).action(async ({value,energy,signal}) => {const mod = await import("./process/reconcile/index.mjs"); return mod.default({value,energy,signal})})
    .success(({update,data}) => update({input: null, port: data.port, starts: data.starts, resourcePid: data.pid})),
  process("stopping", {env: ["server"]}).action(async ({value,energy}) => {const mod = await import("./process/stop/index.mjs"); return mod.default({value,energy})})
    .success(({update,data}) => update({input: null, port: null, stops: data.stops}))
]).reactions(() => []).matter(({html}) => html\`\`).bulk()`
  const declaration = await evaluateMetaSource(source)
  const rootFile = join(artifacts, "root.json")
  await Bun.write(rootFile, JSON.stringify(declaration))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(declaration)}\n`)
  const modules = {
    install: `export default async ({value}) => ({oneshots:value.oneshots+1})`,
    reconcile: `export default async ({value,energy,signal}) => {
      signal.throwIfAborted()
      if (energy.resource) throw new Error("Reconcile must start with fresh Energy")
      const resource = Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response("energy:"+process.pid)})
      energy.resource = resource
      try {
        signal.throwIfAborted()
        return {port:resource.port,starts:value.starts+1,pid:process.pid}
      } catch(error) {await resource.stop(true); delete energy.resource; throw error}
    }`,
    stop: `export default async ({value,energy}) => {
      if (!energy.resource) throw new Error("Meta stop must own the live resource")
      await energy.resource.stop(true)
      delete energy.resource
      return {stops:value.stops+1}
    }`,
  }
  for (const [name, code] of Object.entries(modules)) {
    const folder = join(artifacts, "process", name)
    await mkdir(folder, {recursive: true})
    await Bun.write(join(folder, "package.json"), JSON.stringify({name: `@fixture/lifecycle-${name}`, type: "module", exports: {".": "./index.mjs"}}))
    await Bun.write(join(folder, "index.mjs"), code)
  }
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"],
  })
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  let child: ReturnType<typeof Bun.spawn> | undefined
  const rootAddress = "fixture/initialized"
  const map = JSON.stringify({[rootAddress]: {directory: ".", entry: "meta.mjs"}})
  let firstEnergy: number | undefined
  try {
    for (let run = 0; run < 3; run++) {
      await Promise.all(["boundary", "energy", "matrix"].map(domain => rm(join(stateRoot, `fixture-${domain}.json`), {force: true})))
      const ready = Promise.withResolvers<Ready & {initialization: {mode: string}, rootReads: number, sourceReads: number}>()
      const lifecycle = run === 2 ? undefined : {started: {field: "outsideMetaMustNotOverride", value: "wrong"}, stopping: {field: "outsideMetaMustNotOverride", value: "wrong"}}
      child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env,
        QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile, QUANTUM_FIXTURE_LIFECYCLE: lifecycle ? JSON.stringify(lifecycle) : undefined,
        QUANTUM_FIXTURE_MASS_VALUE: undefined, COSMOS_QUANTUM: "1", COSMOS_QUANTUM_DOMAIN: undefined,
        METAFOR_WEAK_BACKEND: "cpu", METAFOR_ROOT_META: undefined, METAFOR_ROOT_SOURCES: undefined,
        METAFOR_META_SOURCE_ROOT: undefined, METAFOR_META_ARTIFACT_ROOT: artifacts,
        METAFOR_META_ARTIFACT_MAP: map, METAFOR_META_ARTIFACT_MAP_FILE: undefined,
        META_AUTHORING_RPC_SOURCE: undefined, META_AUTHORING_SCOPES: undefined, META_AUTHORING_CREATE_SCOPES: undefined,
      }, stdout: "pipe", stderr: "pipe", ipc(message) {
        if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as never)
      }})
      const current = child
      if (!(current.stdout instanceof ReadableStream) || !(current.stderr instanceof ReadableStream)) throw new Error("Lifecycle fixture pipes unavailable")
      const stdout = new Response(current.stdout).text()
      const stderr = new Response(current.stderr).text()
      const evidence = await Promise.race([ready.promise,
        current.exited.then(async code => {throw new Error(`Lifecycle fixture exited ${code}: ${await stderr}\n${await stdout}`)}),
        Bun.sleep(25_000).then(() => {throw new Error("Root lifecycle readiness timed out")}),
      ])
      expect(evidence.initialization.mode).toBe(run === 0 ? "initialized" : "restored")
      expect(evidence.rootReads).toBe(run === 0 ? 1 : 0)
      expect(evidence.sourceReads).toBe(run === 0 ? 1 : 0)
      const transport = new OracleTransport(`lifecycle-reader-${run}`, new URL(evidence.origin))
      const peer = new OracleRpcPeer(transport.channel)
      let resourcePort: number | undefined
      try {
        await transport.open({methods: [], waitMs: 1000})
        const graph = await peer.call<import("@metafor/types/metafor/graph").Graph>("dark", READ_GRAPH_METHOD, {})
        const root = graph.runtime.roots.find(node => node.kind === "atom" && node.meta === graph.root)
        if (root?.kind !== "atom") throw new Error("Lifecycle root Atom missing")
        let processFailure = ""
        if (root.state !== "ready") {
          const {readdir} = await import("node:fs/promises")
          for (const name of await readdir(join(stateRoot, "dark-force-history/v1/segments"))) {
            const lines = (await Bun.file(join(stateRoot, "dark-force-history/v1/segments", name)).text()).trim().split("\n")
            processFailure += lines.map(line => JSON.parse(line)).filter(entry => entry.particle?.part === "w-").map(entry => JSON.stringify(entry.particle)).join("\n")
          }
        }
        expect(root.state, processFailure).toBe("ready")
        expect(graph.template[graph.root]?.lifecycle).toEqual({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
        expect(root.values.input).toBeNull()
        expect(root.values.oneshots).toBe(1)
        expect(root.values.starts).toBe(run + 1)
        expect(root.values.stops).toBe(Math.max(0, run - 1))
        const energyPid = evidence.children.find(entry => entry.domain === "energy")!.pid
        resourcePort = Number(root.values.port)
        expect(root.values.resourcePid).toBe(energyPid)
        expect(await fetch(`http://127.0.0.1:${resourcePort}`).then(response => response.text())).toBe(`energy:${energyPid}`)
        if (run === 0) firstEnergy = energyPid
        else expect(energyPid).not.toBe(firstEnergy!)
        // Graph/quiesce remain usable while the native resource is live in Energy.
        expect((await fetch(`${evidence.origin}/health`).then(response => response.json()) as {ok: boolean}).ok).toBeTrue()
      } finally {peer.close(); await transport.close()}
      if (run === 0) process.kill(evidence.children.find(entry => entry.domain === "energy")!.pid, "SIGKILL")
      else current.send(run === 1 ? "hold-and-stop" : "stop")
      await Promise.race([current.exited, Bun.sleep(15_000).then(() => {throw new Error("Root lifecycle shutdown timed out")})])
      expect(current.exitCode, await stderr).toBe(run === 0 ? 1 : 0)
      if (resourcePort !== undefined) await expect(fetch(`http://127.0.0.1:${resourcePort}`)).rejects.toThrow()
      for (const entry of evidence.children) expect(() => process.kill(entry.pid, 0)).toThrow()
      if (run === 0) await rm(rootFile)
      child = undefined
    }
  } finally {
    if (child?.exitCode === null) {
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(10_000)])
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }
    await rm(directory, {recursive: true, force: true})
  }
}, 75_000)

/** Native domain links and Graph through an explicit in-process Oracle channel, never an anonymous HTTP admission. */
test("compiled native Quantum reads Graph and restores its stored root over two physical channels", async () => {
  const {evaluateMetaSource} = await import("../../../quantum/dark/load")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-native-quantum-")))
  const executable = join(directory, "release.mjs")
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "meta")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  const declaration = await evaluateMetaSource('export default MetaFor("Native fixture").fields(field => ({title: field.string.required("persisted")})).superposition({ready:null}).mass(() => ({})).energy().processes(() => []).reactions(() => []).matter(({html}) => html``).bulk()')
  const rootFile = join(artifacts, "root.json")
  await Bun.write(rootFile, JSON.stringify(declaration))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(declaration)}\n`)
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"],
  })
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  let child: ReturnType<typeof Bun.spawn> | undefined
  let graph: import("@metafor/types/metafor/graph").Graph | undefined
  const owned = new Set<number>()
  const isAlive = (pid: number) => {try {process.kill(pid, 0); return true} catch {return false}}
  try {
    for (let run = 0; run < 2; run++) {
      const ready = Promise.withResolvers<Ready & {initialization: {mode: string}, rootReads: number, sourceReads: number, graph: import("@metafor/types/metafor/graph").Graph}>()
      child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {
        PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
        QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile, QUANTUM_FIXTURE_PEER: "1",
        META_AUTHORING_RPC_SOURCE: "native-http-observer", META_AUTHORING_SCOPES: "fixture/initialized", META_AUTHORING_CREATE_SCOPES: "fixture/initialized",
        METAFOR_WEAK_BACKEND: "cpu", METAFOR_META_ARTIFACT_ROOT: artifacts,
        METAFOR_META_ARTIFACT_MAP: JSON.stringify({"fixture/initialized": {directory: ".", entry: "meta.mjs"}}),
      }, stdout: "pipe", stderr: "pipe", ipc(message) {
        if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as never)
      }})
      const current = child
      if (!(current.stdout instanceof ReadableStream) || !(current.stderr instanceof ReadableStream)) throw new Error("Native fixture pipes unavailable")
      const stdout = new Response(current.stdout).text()
      const stderr = new Response(current.stderr).text()
      const evidence = await Promise.race([ready.promise,
        current.exited.then(async code => {throw new Error(`Native fixture exited ${code}: ${await stderr}\n${await stdout}`)}),
        Bun.sleep(30_000).then(() => {throw new Error("Native Quantum readiness timed out")}),
      ])
      for (const item of evidence.children) owned.add(item.pid)
      expect(evidence.initialization.mode).toBe(run === 0 ? "initialized" : "restored")
      expect(evidence.rootReads).toBe(run === 0 ? 1 : 0)
      expect(evidence.sourceReads).toBe(run === 0 ? 1 : 0)
      expect(String(evidence.graph.root)).toBe("fixture/initialized")
      expect(evidence.graph.template[evidence.graph.root]?.name).toBe("Native fixture")
      if (graph) expect(evidence.graph).toEqual(graph)
      graph = evidence.graph
      const health = await fetch(`${evidence.origin}/health`).then(response => response.json()) as {transport: {links: {transport: string, channels: {name: string, state: string}[]}[]}}
      expect(health.transport.links).toHaveLength(3)
      for (const link of health.transport.links) {
        expect(link.transport).toBe("direct")
        expect(link.channels).toEqual([{name: "oracle", state: "open"}, {name: "force", state: "open"}])
      }
      for (const route of ["/force", "/ws", "/oracle/ws"]) {
        for (const method of ["GET", "POST", "DELETE"]) {
          expect((await fetch(`${evidence.origin}${route}`, {method})).status).toBe(403)
        }
      }
      const {OracleRpcPeer, OracleTransport} = await import("shared/transport/oracle")
      const transport = new OracleTransport("native-http-observer", evidence.origin)
      const peer = new OracleRpcPeer(transport.channel)
      try {
        await transport.open()
        expect(transport.identity).toMatch(/^observer:/)
        const concurrent = new OracleTransport("native-http-observer", evidence.origin)
        const concurrentPeer = new OracleRpcPeer(concurrent.channel)
        try {
          await concurrent.open()
          expect(concurrent.identity).not.toBe(transport.identity)
          expect(await concurrentPeer.call<typeof evidence.graph>("dark", "readGraph", {})).toEqual(evidence.graph)
        } finally {concurrentPeer.close(); await concurrent.close()}
        expect(await peer.call<typeof evidence.graph>("dark", "readGraph", {})).toEqual(evidence.graph)
        expect(await peer.call("dark", "meta.capabilities.read", {contractVersion: 1})).toMatchObject({contractVersion: 1, capabilities: []})
        const prior = transport.identity
        await transport.close()
        await transport.open()
        expect(transport.identity).toMatch(/^observer:/)
        expect(transport.identity).not.toBe(prior)
        expect(await peer.call<typeof evidence.graph>("dark", "readGraph", {})).toEqual(evidence.graph)
      } finally {peer.close(); await transport.close()}
      for (const identity of ["dark", "boundary", "matrix", "energy", "cosmos-clients", "observer:injected"]) {
        const response = await fetch(`${evidence.origin}/oracle/channels`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({version: 1, identity, methods: []})})
        expect(response.status).toBe(403)
      }
      const opening = await fetch(`${evidence.origin}/oracle/channels`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({version: 1, identity: "negative-observer", methods: []})})
      const {channel} = await opening.json() as {channel: string}
      const auth = {"Content-Type": "application/json", Authorization: `Bearer ${channel}`}
      try {
        expect((await fetch(`${evidence.origin}/oracle/rpc`, {method: "POST", headers: auth, body: JSON.stringify({version: 1, id: "spoof", source: "energy", target: "dark", method: "readGraph", params: {}})})).status).toBe(400)
        expect((await fetch(`${evidence.origin}/oracle/rpc`, {method: "POST", headers: {...auth, Origin: "https://outsider.invalid"}, body: "{}"})).status).toBe(403)
        expect((await fetch(`${evidence.origin}/oracle/rpc`, {method: "POST", headers: {...auth, Forwarded: "for=127.0.0.1"}, body: "{}"})).status).toBe(403)
        expect((await fetch(`${evidence.origin}/oracle/rpc`, {method: "POST", headers: auth, body: JSON.stringify({version: 1, id: "capacity", target: "dark", method: "readGraph", params: "x".repeat(1024 * 1024)})})).status).toBe(400)
        expect((await fetch(`${evidence.origin}/oracle/channels`, {method: "POST", headers: auth, body: JSON.stringify({version: 1, identity: "not-provider", methods: ["readGraph"], endpoint: `${evidence.origin}/callback`, callback: "private"})})).status).toBe(400)
      } finally {await fetch(`${evidence.origin}/oracle/channel`, {method: "DELETE", headers: {Authorization: `Bearer ${channel}`}})}
      current.send("stop")
      await Promise.race([current.exited, Bun.sleep(5000).then(() => {throw new Error("Native Quantum cleanup timed out")})])
      for (const pid of owned) expect(isAlive(pid)).toBeFalse()
      expect(current.exitCode, await stderr).toBe(0)
      await stdout
      await rm(rootFile, {force: true})
    }
  } finally {
    if (child?.exitCode === null) {
      child.send("stop")
      await Promise.race([child.exited, Bun.sleep(5000)])
      if (child.exitCode === null) {child.kill("SIGKILL"); await child.exited}
    }
    for (const pid of owned) if (isAlive(pid)) {try {process.kill(pid, "SIGKILL")} catch {}}
    await rm(directory, {recursive: true, force: true})
  }
}, 75_000)
