import "@metafor/dsl"
import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {extname, join} from "node:path"
import {pathToFileURL} from "node:url"
import {prepareMetaPackage} from "../meta"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type InstalledArtifactIdentity, type PublishedReleaseGraph} from "../../release/installed"

const declaration = () => ({
  name: "fixture", fields: [{key: "result", type: "string"}], superposition: [{name: "ready"}],
  processes: [
    {key: "ready", declaration: {type: "action", env: ["server"], action: {
      src: "./actions/ready.ts", importSpecifier: "default", wrapperSrc: "async params => (await import('./actions/ready.ts')).default(params)",
    }, success: {src: "async ({update,data}) => update((await import('./actions/success.ts')).default(data))"}}},
    {key: "stop", declaration: {type: "finally", before: {src: "async params => (await import('./actions/cleanup.ts')).default(params)"}}},
  ],
})

async function fixture(exports: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "meta-artifact-fixture-"))
  const root = join(directory, "source")
  await mkdir(join(root, "actions"), {recursive: true})
  await writeFile(join(root, "meta.ts"), `
export default MetaFor("fixture")
  .fields(field => ({result: field.string.optional()}))
  .superposition({ready: null, stop: null}).mass(() => ({})).energy()
  .processes((process,destroy) => [
    process("ready", {env:["server"]})
      .action(async ({energy}) => {
        const m=await import("./actions/ready.ts")
        return m.default({energy})
      })
      .success(async ({data,update}) => {
        const m=await import("./actions/success.ts")
        const result=m.default(data)
        update({result:result.result})
      }),
    destroy("stop", {env:["server"]})
      .before(async ({energy,mass,signal}) => {
        const m=await import("./actions/cleanup.ts")
        return m.default({energy,mass,signal})
      }),
  ]).reactions(() => []).matter().bulk()
` )
  await writeFile(join(root, "package.json"), JSON.stringify({name: "@owner/fixture", version: "1.0.0", type: "module", exports: {
    ".": "./index.ts", "./meta": "./meta.ts", "./ready": "./actions/ready.ts", "./success": "./actions/success.ts", "./cleanup": "./actions/cleanup.ts", "./resource.txt": "./resource.txt", ...exports,
  }}))
  await writeFile(join(root, "index.ts"), "export {next} from './actions/shared'\nexport const product='unchanged product'\n")
  await writeFile(join(root, "actions/shared.ts"), "let calls=0\nexport const next=()=>++calls\n")
  await writeFile(join(root, "actions/ready.ts"), "import {next} from './shared'\nexport default () => ({value:'cached-'+next()})\n")
  await writeFile(join(root, "actions/success.ts"), "import {next} from './shared'\nexport default data => ({result:data.value+':'+next()})\n")
  await writeFile(join(root, "actions/cleanup.ts"), "export default ({energy}) => { energy.cleaned=true }\n")
  await writeFile(join(root, "resource.txt"), "exact resource bytes\n")
  return {directory, root, outdir: join(directory, "build"), cleanup: () => rm(directory, {recursive: true, force: true})}
}

function graph(prepared: Awaited<ReturnType<typeof prepareMetaPackage>>): PublishedReleaseGraph {
  const publicArtifacts = Object.fromEntries(prepared.owner.sources.filter(source => source.artifact !== ".").map(source =>
    [source.artifact, /\.[cm]?[jt]sx?$/.test(source.source) ? ".js" : extname(source.source)]))
  return {schemaVersion: 1, packages: [{name: prepared.result.module, version: prepared.version, dependencies: {}, environments: [{
    env: "server", publicArtifacts,
    outputs: prepared.result.outputs.map(output => ({artifact: output.artifact!, kind: output.kind!, type: output.type, sha256: output.sha256, size: output.size, load: output.load!})),
  }]}]}
}

function artifactSource(prepared: Awaited<ReturnType<typeof prepareMetaPackage>>) {
  return {async read(identity: InstalledArtifactIdentity) {
    const output = prepared.result.outputs.find(output => output.artifact === identity.artifact && output.sha256 === identity.sha256)
    if (!output) throw new Error("Unknown prepared artifact")
    return Bun.file(output.path).stream()
  }}
}

for (const name of ["@owner/fixture", "metafor"]) test(`${name} preserves product root and installs separate Meta/actions after source deletion`, async () => {
  const f = await fixture()
  const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
  const exports = name.startsWith("@") ? {...manifest.exports, ".": {"owner:server": "./index.ts"}, "./meta": {"owner:server": "./meta.ts"}} : manifest.exports
  await writeFile(join(f.root, "package.json"), JSON.stringify({...manifest, name, exports}))
  let evaluations = 0
  try {
    const before = await readFile(join(f.root, "package.json"), "utf8")
    const readDeclaration = async (path: string) => {
      evaluations++
      const javascript = new Bun.Transpiler({loader: "ts", target: "bun"}).transformSync(await readFile(path, "utf8"))
      const url = URL.createObjectURL(new Blob([javascript], {type: "text/javascript"}))
      try { return (await import(url)).default } finally { URL.revokeObjectURL(url) }
    }
    const prepared = await prepareMetaPackage({root: f.root, address: name, outdir: f.outdir, readDeclaration})
    if (!prepared.result.success) throw new Error(prepared.result.stderr)
    expect(prepared.result.success).toBeTrue()
    expect(evaluations).toBe(1)
    expect(await readFile(join(f.root, "package.json"), "utf8")).toBe(before)
    expect(prepared.result.outputs.some(output => output.kind === "chunk")).toBeTrue()
    const storedGraph = graph(prepared)
    const store = createInstalledReleaseStore({root: join(f.directory, "installed")})
    const candidate = await store.prepare(storedGraph, artifactSource(prepared))
    expect(candidate.digest).toBe(publishedReleaseGraphDigest(storedGraph))
    const repeated = await prepareMetaPackage({root: f.root, address: name, outdir: join(f.directory, "repeated"), readDeclaration})
    if (!repeated.result.success) throw new Error(repeated.result.stderr)
    expect(publishedReleaseGraphDigest(graph(repeated))).toBe(candidate.digest)
    await store.prepare(graph(repeated), artifactSource(repeated))
    await writeFile(join(f.root, "meta.ts"), (await readFile(join(f.root, "meta.ts"), "utf8")).replace('MetaFor("fixture")', 'MetaFor("fixture",{desc:"changed"})'))
    const changed = await prepareMetaPackage({root: f.root, address: name, outdir: join(f.directory, "changed"), readDeclaration})
    expect(changed.result.success).toBeTrue()
    await expect(store.prepare(graph(changed), artifactSource(changed))).rejects.toThrow("Immutable installed release conflict")
    const rootOutput = storedGraph.packages[0]!.environments[0]!.outputs.find(output => output.artifact === ".")!
    const productEntry = await store.artifactPath(candidate.digest, {name: prepared.result.module, version: prepared.version, env: "server", ...rootOutput})
    const metaOutput = storedGraph.packages[0]!.environments[0]!.outputs.find(output => output.artifact === "./meta")!
    const entry = await store.artifactPath(candidate.digest, {name: prepared.result.module, version: prepared.version, env: "server", ...metaOutput})
    await rm(f.root, {recursive: true, force: true})
    await rm(f.outdir, {recursive: true, force: true})
    const runner = join(f.directory, "run.ts")
    const energyModule = pathToFileURL(join(import.meta.dir, "../../../quantum/energy/energy.ts")).href
    const catalogModule = pathToFileURL(join(import.meta.dir, "../../../quantum/energy/graph/catalog.ts")).href
    const resolverModule = pathToFileURL(join(import.meta.dir, "../../../shared/metafor/source.ts")).href
    await writeFile(runner, `
import {pathToFileURL} from "node:url"
import {dirname,relative} from "node:path"
import {startEnergyProtocol,createInMemoryEnergyMassStore} from ${JSON.stringify(energyModule)}
import {EnergyCatalogStore} from ${JSON.stringify(catalogModule)}
import {createMetaSourceResolver} from ${JSON.stringify(resolverModule)}
const entry=process.argv[2]
const productEntry=process.argv[3]
const product=await import(pathToFileURL(productEntry).href)
const meta=(await import(pathToFileURL(entry).href)).default
const messages=[]
const force={onImpulse(){},impulse(message){messages.push(message)}}
const energy={}
const protocol=startEnergyProtocol({force,catalog:new EnergyCatalogStore(),energyId:"cached-energy",
  sourceResolver:createMetaSourceResolver({root:dirname(productEntry),artifacts:{${JSON.stringify(name)}:{directory:".",entry:relative(dirname(productEntry),entry)}}}),
  massStore:createInMemoryEnergyMassStore(),energyStore:{get:()=>energy,bind(){},release(){},clear(){}}})
const emit=part=>force.onImpulse({parts:[{ts:1,...part}]})
emit({part:"graviton",op:"add",path:"atom/17",value:{atom:{id:17,parentAtom:null,parentTopology:null,wimp:${JSON.stringify(name)},position:0},values:[],valueRecords:[],valueItems:[],state:null}})
for (const [index,process] of meta.processes.entries()) {
  const d=process.declaration
  const fields=names=>(names??[]).map(name=>[1,name])
  const descriptor=d.type==="action"
    ? {...d,key:process.key,action:{...d.action,readFields:fields(d.action.read)},success:{...d.success,readFields:fields(d.success?.read),writeFields:fields(d.success?.write)}}
    : {...d,key:process.key,before:{...d.before,readFields:fields(d.before.read)}}
  emit({part:"graviton",op:"add",path:"process",value:{id:101+index,wimp:${JSON.stringify(name)},localId:index+1,state:process.key,descriptor}})
}
const wait=async predicate=>{
  const deadline=Date.now()+5000
  while(!predicate()){
    if(Date.now()>deadline)throw Error("Energy timed out")
    await Bun.sleep(0)
  }
}
const execute=async(state,id)=>{
  emit({part:"photon",op:"test",path:17,from:id,value:state})
  await wait(()=>messages.some(message=>message.parts.some(part=>part.part==="z"&&part.value.processExecutionId===id)))
  emit({part:"z",op:"copy",path:17,from:"cached-energy",value:{processExecutionId:id,fields:{}}})
  await wait(()=>messages.some(message=>message.parts.some(part=>(part.part==="w+"||part.part==="w-")&&part.value.processExecutionId===id)))
  return messages.flatMap(message=>message.parts).find(part=>(part.part==="w+"||part.part==="w-")&&part.value.processExecutionId===id)
}
try {
  const result=await execute("ready","cached-action")
  if(result.part!=="w+")throw Error(JSON.stringify(result))
  const cleanup=await execute("stop","cached-cleanup")
  if(cleanup.part!=="w+")throw Error(JSON.stringify(cleanup))
  await protocol.quiesce()
  console.log(JSON.stringify({result:result.value.fields["1"],cleaned:energy.cleaned,product:product.product,shared:product.next(),actionSrc:meta.processes[0].declaration.action.src}))
}finally{protocol.close()}
`)
    const child = Bun.spawn([process.execPath, runner, entry, productEntry], {stdout: "pipe", stderr: "pipe"})
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(exit).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({result: "cached-1:2", cleaned: true, product: "unchanged product", shared: 3, actionSrc: expect.stringContaining(".public/server/ready/")})
    const resource = storedGraph.packages[0]!.environments[0]!.outputs.find(output => output.artifact === "./resource.txt")!
    expect(await Bun.file(await store.artifactPath(candidate.digest, {name: prepared.result.module, version: prepared.version, env: "server", ...resource})).text()).toBe("exact resource bytes\n")
  } finally { await f.cleanup() }
}, 20_000)

test("rejects serialized action imports absent from exports and leaves source manifest unchanged", async () => {
  const f = await fixture()
  try {
    const input = declaration()
    input.processes[0]!.declaration.action!.src = "./private.ts"
    const original = await readFile(join(f.root, "package.json"), "utf8")
    await expect(prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: f.outdir, readDeclaration: () => input})).rejects.toThrow("not an exported script")
    expect(await readFile(join(f.root, "package.json"), "utf8")).toBe(original)
  } finally { await f.cleanup() }
})

test("inert Meta with no action graph uses the same preparation contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meta-inert-fixture-"))
  const root = join(directory, "source")
  await mkdir(root)
  await writeFile(join(root, "meta.ts"), "source")
  await writeFile(join(root, "package.json"), JSON.stringify({name: "@owner/fixture", version: "1.0.0", exports: {".": "./meta.ts"}}))
  try {
    const prepared = await prepareMetaPackage({root, address: "@owner/fixture", metaArtifact: ".", outdir: join(directory, "build"), readDeclaration: () => ({name: "inert", fields: [], superposition: []})})
    if (!prepared.result.success) throw new Error(prepared.result.stderr)
    expect(prepared.result.success).toBeTrue()
    expect(prepared.result.outputs).toHaveLength(1)
  } finally { await rm(directory, {recursive: true, force: true}) }
})

test("standalone Process public dependencies compile privately with lazy code/resources and no source execution", async () => {
  const f = await fixture()
  try {
    const processRoot = join(f.root, "node_modules/@owner/run")
    const helperRoot = join(f.root, "node_modules/helper")
    await mkdir(processRoot, {recursive: true})
    await mkdir(helperRoot, {recursive: true})
    await writeFile(join(helperRoot, "package.json"), JSON.stringify({name: "helper", version: "1.0.0", exports: {".": {"helper:server": "./index.ts"}}}))
    await writeFile(join(helperRoot, "index.ts"), "export const prefix='public-helper'\n")
    await writeFile(join(processRoot, "package.json"), JSON.stringify({name: "@owner/run", version: "1.0.0", type: "module", dependencies: {helper: "1.0.0"}, exports: {
      ".": {"owner:server": "./index.ts"}, "./private": null,
    }}))
    await writeFile(join(processRoot, "index.ts"), `
import {prefix} from 'helper'
import resource from './resource.txt' with {type:'file'}
globalThis.preparedProcessLoaded = true
export default async () => ({value:prefix+':'+(await import('./lazy.ts')).default+':'+await Bun.file(new URL(resource,import.meta.url)).text()})
`)
    await writeFile(join(processRoot, "lazy.ts"), "globalThis.preparedLazyLoaded=true\nexport default 'lazy'\n")
    await writeFile(join(processRoot, "resource.txt"), "stored-resource")
    const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
    await writeFile(join(f.root, "package.json"), JSON.stringify({...manifest, dependencies: {"@owner/run": "1.0.0"}}))
    const input = {name: "standalone", fields: [], superposition: [], processes: [{key: "ready", declaration: {type: "action", action: {
      src: "@owner/run", importSpecifier: "default", wrapperSrc: "async params => (await import('@owner/run')).default(params)",
    }}}]}
    const prepared = await prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: f.outdir, readDeclaration: () => input})
    if (!prepared.result.success) throw new Error(prepared.result.stderr)
    // An explicit public alias to the same dependency uses its server condition
    // even when the parent Bun process has no owner:server resolution condition.
    await writeFile(join(f.root, "package.json"), JSON.stringify({...manifest, dependencies: {"@owner/run": "1.0.0"}, exports: {...manifest.exports, "./process": "@owner/run"}}))
    const aliased = await prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: join(f.directory, "aliased"), readDeclaration: () => input})
    if (!aliased.result.success) throw new Error(aliased.result.stderr)
    expect(aliased.result.outputs.some(output => output.artifact === "./process")).toBeTrue()
    expect((globalThis as {preparedProcessLoaded?: boolean}).preparedProcessLoaded).toBeUndefined()
    expect(prepared.owner.sources.map(source => source.artifact)).not.toContain("./run")
    expect(prepared.result.outputs.some(output => output.kind === "asset" && output.load === "lazy")).toBeTrue()
    const storedGraph = graph(prepared)
    const store = createInstalledReleaseStore({root: join(f.directory, "installed")})
    const candidate = await store.prepare(storedGraph, artifactSource(prepared))
    const output = (artifact: string) => storedGraph.packages[0]!.environments[0]!.outputs.find(output => output.artifact === artifact)!
    const entry = await store.artifactPath(candidate.digest, {name: prepared.address, version: prepared.version, env: "server", ...output("./meta")})
    const product = await store.artifactPath(candidate.digest, {name: prepared.address, version: prepared.version, env: "server", ...output(".")})
    await rm(f.root, {recursive: true, force: true})
    await rm(f.outdir, {recursive: true, force: true})
    const runner = join(f.directory, "run.ts")
    await writeFile(runner, `
import {pathToFileURL} from 'node:url'
import {dirname,resolve} from 'node:path'
const meta=(await import(pathToFileURL(process.argv[2]).href)).default
const action=meta.processes[0].declaration.action
const module=await import(pathToFileURL(resolve(dirname(process.argv[3]),action.src)).href)
if(globalThis.preparedLazyLoaded)throw Error('lazy code was executed eagerly')
console.log(JSON.stringify({result:await module.default(),loaded:globalThis.preparedProcessLoaded,lazy:globalThis.preparedLazyLoaded,src:action.src,wrapper:action.wrapperSrc}))
`)
    const child = Bun.spawn([process.execPath, runner, entry, product], {stdout: "pipe", stderr: "pipe"})
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(exit).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({result: {value: "public-helper:lazy:stored-resource"}, loaded: true, lazy: true,
      src: expect.stringContaining("./.cosmos/server/entry/"), wrapper: expect.not.stringContaining("@owner/run")})
  } finally { await f.cleanup() }
})

test("explicit aliases of one Meta-only declaration evaluate once and remain inert after source deletion", async () => {
  const f = await fixture()
  const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
  await writeFile(join(f.root, "package.json"), JSON.stringify({...manifest, exports: {...manifest.exports,
    ".": "./meta.ts", "./meta": "./meta.ts", "./declaration": "./meta.ts"}}))
  let evaluations = 0
  try {
    const prepared = await prepareMetaPackage({root: f.root, address: "@owner/fixture", metaArtifact: ".", outdir: f.outdir,
      readDeclaration: () => {evaluations++; return declaration()}})
    if (!prepared.result.success) throw new Error(prepared.result.stderr)
    expect(evaluations).toBe(1)
    expect(prepared.result.outputs.filter(output => output.artifact === "./.cosmos/entry/meta-declaration.js")).toHaveLength(1)
    const stored = graph(prepared)
    const store = createInstalledReleaseStore({root: join(f.directory, "installed")})
    const candidate = await store.prepare(stored, artifactSource(prepared))
    const entries = await Promise.all([".", "./meta", "./declaration"].map(async artifact => {
      const output = stored.packages[0]!.environments[0]!.outputs.find(output => output.artifact === artifact)!
      return await store.artifactPath(candidate.digest, {name: prepared.address, version: prepared.version, env: "server", ...output})
    }))
    await rm(f.root, {recursive: true, force: true})
    await rm(f.outdir, {recursive: true, force: true})
    const child = Bun.spawn([process.execPath, "-e", `
      const values=await Promise.all(process.argv.slice(1).map(async path=>(await import(path)).default))
      if(values.some(value=>JSON.stringify(value)!==JSON.stringify(values[0])))throw Error('Declaration aliases differ')
      console.log(values[0].processes[0].declaration.action.src)
    `, ...entries], {cwd: f.directory, stdout: "pipe", stderr: "pipe"})
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    expect(stdout).toContain(".public/server/ready/")
  } finally {await f.cleanup()}
})

test("Meta-only root is explicit and canonical identity never drops scope", async () => {
  const f = await fixture()
  try {
    const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
    delete manifest.exports["./meta"]
    manifest.exports["."] = "./meta.ts"
    await writeFile(join(f.root, "package.json"), JSON.stringify(manifest))
    await expect(prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: f.outdir, readDeclaration: declaration})).rejects.toThrow()
    await expect(prepareMetaPackage({root: f.root, address: "owner/fixture", metaArtifact: ".", outdir: f.outdir, readDeclaration: declaration})).rejects.toThrow("Invalid Meta package name")
  } finally { await f.cleanup() }
})

test("serialized imports reject undeclared, private and escaping dependency exports", async () => {
  const f = await fixture()
  try {
    const dependency = join(f.root, "node_modules/run")
    await mkdir(dependency, {recursive: true})
    await writeFile(join(dependency, "package.json"), JSON.stringify({name: "run", version: "1.0.0", exports: {".": "./index.ts", "./escape": "./../../../outside.ts"}}))
    await writeFile(join(dependency, "index.ts"), "export default () => {}")
    await writeFile(join(f.directory, "outside.ts"), "export default () => {}")
    const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
    const prepare = (specifier: string, index: number) => {
      const input = declaration()
      input.processes[0]!.declaration.action!.src = specifier
      return prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: join(f.directory, `build-${index}`), readDeclaration: () => input})
    }
    await expect(prepare("run", 0)).rejects.toThrow("direct runtime dependency")
    await writeFile(join(f.root, "package.json"), JSON.stringify({...manifest, dependencies: {run: "1.0.0"}}))
    await expect(prepare("run/private", 1)).rejects.toThrow("Missing public server export")
    await expect(prepare("run/escape", 2)).rejects.toThrow("escapes package root")
    await expect(prepare("../outside.ts", 3)).rejects.toThrow("escapes source root")
    const computed = declaration()
    computed.processes[0]!.declaration.action!.wrapperSrc = "async () => import(process.env.SOURCE_ACTION)"
    await expect(prepareMetaPackage({root: f.root, address: "@owner/fixture", outdir: join(f.directory, "computed"), readDeclaration: () => computed})).rejects.toThrow("exact literal public module")
  } finally { await f.cleanup() }
})
