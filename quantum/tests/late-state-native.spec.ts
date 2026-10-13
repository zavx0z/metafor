import {expect, test} from "bun:test"
import {mkdir, mkdtemp, realpath, rm} from "node:fs/promises"
import {join, resolve} from "node:path"
import {tmpdir} from "node:os"
import {evaluateMetaSource} from "../dark/load"
import {open} from "../boundary/sqlite"
import {DarkForceHistory} from "../dark/force/history"
import {DarkCheckpointControl, readCheckpointControlState} from "../dark/checkpoint/control"
import {particleDestinations} from "../dark/force/route"
import {EnergyMassCatalog} from "../energy/mass"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import type {SourcedParticle} from "shared/protocol/force/particle"
import type {Graph} from "@metafor/types/metafor/graph"

const ROOT = "fixture/initialized", CHILD = "fixture/late-child"
const participants = ["dark", "boundary", "matrix", "energy"] as const
const fields = (state: BoundaryInitialState, meta: string) => {
  const atom = state.atoms.find(atom => atom.wimp === meta)!
  return {atom, values: Object.fromEntries(state.declarations.filter(item => item.src === meta && item.section === "fields").map(item => [item.value.key, atom.values.find(value => value.field === item.value.id)?.value]))}
}

test.each([false, true])("four actual domains settle a persisted late State intent before root started; Process-bound=%s", async processBound => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "quantum-late-state-native-")))
  const stateRoot = join(directory, "state"), artifacts = join(directory, "meta"), executable = join(directory, "runtime.mjs")
  const rootFile = join(artifacts, "root.json")
  await mkdir(join(artifacts, "process"), {recursive: true})
  const root = await evaluateMetaSource(`export default MetaFor("Native recovery Root")
    .fields(field=>({input:field.string.optional(),starts:field.number.required(0)}))
    .lifecycle({started:{field:"input",value:"started"},stopping:{field:"input",value:"stopping"}})
    .superposition({waiting:{starting:{input:{eq:"started"}}},starting:{ready:{input:{null:true}}},ready:{starting:{input:{eq:"started"}},stopped:{input:{eq:"stopping"}}},stopped:{starting:{input:{eq:"started"}}}})
    .mass(()=>({})).energy().processes(process=>[process("starting",{env:["server"]})
      .action(async({value})=>{const action=await import("./process/root.mjs");return action.default({value})})
      .success(({update,data})=>update({starts:data.starts,input:null}))]).reactions()
    .matter(({html})=>html\`<meta-for src="${CHILD}" />\`).bulk()`)
  const child = await evaluateMetaSource(`export default MetaFor("Native late State")
    .fields(field=>({advance:field.boolean.required(false),done:field.boolean.required(false),readyRuns:field.number.required(0)}))
    .superposition({observing:{ready:{advance:{eq:true}}},ready:null}).mass(mass=>({log:mass.json()})).energy()
    .processes(process=>[process("observing",{env:["server"]})
      .action(async({mass})=>{const action=await import("./process/observe.mjs");return action.default({mass})})
      .success(({update})=>update({done:true}))${processBound ? ',process("ready",{env:["server"]}).action(async({mass,value})=>{const action=await import("./process/ready.mjs");return action.default({mass,value})}).success(({update,data})=>update({readyRuns:data.runs}))' : ""}])
    .reactions().matter().bulk()`)
  await Bun.write(rootFile, JSON.stringify(root))
  await Bun.write(join(artifacts, "child.json"), JSON.stringify(child))
  await Bun.write(join(artifacts, "root.mjs"), `export default ${JSON.stringify(root)}`)
  await Bun.write(join(artifacts, "child.mjs"), `export default ${JSON.stringify(child)}`)
  await Bun.write(join(artifacts, "process/root.mjs"), "export default async ({value}) => ({starts:value.starts+1})")
  await Bun.write(join(artifacts, "process/observe.mjs"), 'export default async ({mass}) => {await mass.log.write(["observing"]);return true}')
  await Bun.write(join(artifacts, "process/ready.mjs"), 'export default async ({mass,value}) => {const log=await mass.log.readJson();await mass.log.write([...log,"ready"]);return {runs:value.readyRuns+1}}')
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "../../cosmos/release/spec/fixture/quantum.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  type Ready = {world: {state: BoundaryInitialState}, graph: Graph, health: {ok: boolean, state: string}, initialization: {mode: string}, children: {domain: string,pid: number}[]}
  let running: ReturnType<typeof launch> | undefined
  function launch() {
    const ready = Promise.withResolvers<Ready>()
    const child = Bun.spawn([process.execPath, executable], {cwd: directory, env: {
      PATH: Bun.env.PATH, HOME: Bun.env.HOME, TMPDIR: Bun.env.TMPDIR, METAFOR_WEAK_BACKEND: "cpu",
      QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile, QUANTUM_FIXTURE_PEER: "1",
      METAFOR_META_ARTIFACT_ROOT: artifacts,
      METAFOR_META_ARTIFACT_MAP: JSON.stringify({[ROOT]: {directory: ".",entry: "root.mjs"}, [CHILD]: {directory: ".",entry: "child.mjs"}}),
    }, stdout: "pipe",stderr: "pipe",ipc(message) {if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as Ready)}})
    const stderr = new Response(child.stderr).text(), stdout = new Response(child.stdout).text()
    const result = Promise.race([ready.promise, child.exited.then(async code => {throw new Error(`Native recovery exited ${code}: ${await stderr}\n${await stdout}`)}), Bun.sleep(30_000).then(()=>{throw new Error("Native recovery readiness timed out")})])
    return {child, result, async stop(evidence?: Ready) {
      child.send("hold-and-stop")
      await Promise.race([child.exited,Bun.sleep(10_000).then(()=>{throw new Error("Native recovery cleanup timed out")})])
      expect(child.exitCode, await stderr).toBe(0)
      for (const domain of evidence?.children ?? []) expect(()=>process.kill(domain.pid,0)).toThrow()
    }, stderr, stdout}
  }
  try {
    running = launch()
    const first = await running.result
    expect(first.initialization.mode).toBe("initialized")
    expect(fields(first.world.state, CHILD).values.done).toBeTrue()
    await running.stop(first)
    running = undefined
    const historyRoot = join(stateRoot, "dark-force-history/v1"), controlPath = join(stateRoot, "checkpoint-control/v1/state.json")
    const history = new DarkForceHistory(historyRoot)
    const control = new DarkCheckpointControl(controlPath, history.status(), {expose() {}, async call(_target, _method, receipt) {return receipt as never}}, participants)
    const boundary = await open(join(stateRoot, "dev.sqlite"))
    let atomId = 0
    try {
      const initial = await boundary.initialState()
      atomId = fields(initial, CHILD).atom.id
      const advance = initial.declarations.find(item=>item.src===CHILD && item.section==="fields" && item.value.key==="advance")!.value.id as number
      // Fault seed owns a fully stopped disposable contour. Canonical Fields
      // already permit the outgoing Matrix choice, while its State remains old.
      await boundary.materialize({parts:[{part:"gluon",op:"replace",path:atomId,by:"agent",ts:10,value:{fields:{[advance]:true}}}]})
      expect(fields(await boundary.initialState(),CHILD).atom.state).toBe(fields(initial,CHILD).atom.state)
    } finally {await boundary.close()}
    const eventId = crypto.randomUUID()
    const source: SourcedParticle = {part:"photon",op:processBound?"test":"replace",path:atomId,by:"matrix",ts:11,from:eventId,value:"ready"}
    const acceptance = history.accept(source)
    control.recordAccepted(acceptance.sequence, particleDestinations({parts:[source]},"matrix",participants))
    control.acceptedFrom("matrix")
    expect(control.pendingDeliveries().some(receipt=>receipt.domain==="boundary" && receipt.acceptanceSequence===acceptance.sequence)).toBeTrue()
    expect(history.read({from:eventId,by:"boundary"})).toEqual([])
    running = launch()
    const restored = await running.result
    expect(restored.initialization.mode).toBe("restored")
    expect(restored.health.ok).toBeTrue()
    expect(fields(restored.world.state,ROOT).values.starts).toBe(2)
    const current = fields(restored.world.state,CHILD)
    const readyId = restored.world.state.declarations.find(item=>item.src===CHILD && item.section==="states" && item.value.name==="ready")!.value.id
    expect(current.atom.state).toBe(readyId as number)
    expect(current.values.readyRuns).toBe(processBound?1:0)
    const after = new DarkForceHistory(historyRoot)
    const confirmation = after.read({from:eventId,by:"boundary",part:"photon",op:"copy"})
    expect(confirmation).toHaveLength(1)
    expect(confirmation[0]!.sequence).toBeGreaterThan(acceptance.sequence)
    const started = after.read({part:"gluon",by:"agent"}).filter(entry=>JSON.stringify(entry.particle.value).includes("started")).at(-1)
    expect(started?.sequence).toBeGreaterThan(confirmation[0]!.sequence)
    const checkpoint = readCheckpointControlState(controlPath,participants)
    expect(checkpoint.barrier.domains.every(domain=>domain.appliedOrdinal===domain.receipts.length)).toBeTrue()
    await running.stop(restored)
    running = undefined
    const childAtom = restored.graph.runtime.roots.flatMap(root=>root.children??[]).find(atom=>atom.kind==="atom" && atom.meta===CHILD)
    if (!childAtom || childAtom.kind!=="atom") throw new Error("Native child Graph is missing")
    const log = childAtom.mass.find(mass=>mass.key==="log")!
    const catalog = new EnergyMassCatalog(join(stateRoot,"mass"))
    expect(JSON.parse(new TextDecoder().decode(await catalog.read(log.ref.replace(/^mass:/,""),"json")))).toEqual(processBound?["observing","ready"]:["observing"])
  } finally {
    if (running?.child.exitCode === null) {
      running.child.send("stop")
      await Promise.race([running.child.exited, Bun.sleep(8000)])
      if (running.child.exitCode === null) running.child.kill("SIGKILL")
      await running.child.exited
    }
    await rm(directory,{recursive:true,force:true})
  }
},90_000)
