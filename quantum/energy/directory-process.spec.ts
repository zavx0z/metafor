import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readdir, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {evaluateMetaSource} from "../dark/load"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {READ_GRAPH_METHOD, type Graph} from "@metafor/types/metafor/graph"
import {ENERGY_MASS_RESULT_READ_METHOD, META_FIELD_VALUE_APPLY_METHOD, DARK_FORCE_HISTORY_READ_METHOD, type DarkForceHistoryReadReceipt} from "shared/protocol/metafor/observation"

test("Meta Process owns live directory lease; Graph/quiesce work and cold boot retains bytes", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-directory-process-")))
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "artifacts")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  const declaration = await evaluateMetaSource(`export default MetaFor("Directory resource")
.fields(field => ({input:field.string.optional(),runs:field.number.required(0),port:field.number.optional(),probe:field.boolean.required(false),error:field.string.optional()}))
.lifecycle({started:{field:"input",value:"started"},stopping:{field:"input",value:"stopping"}})
.superposition({waiting:{start:{input:{eq:"started"}}},start:{ready:{input:{null:true}}},ready:{start:{input:{eq:"started"}},stop:{input:{eq:"stopping"}}},stop:{stopped:{input:{null:true}}},stopped:{start:{input:{eq:"started"}}}})
.mass(mass => ({workspace:mass.directory()})).energy<{lease: import("@metafor/types/metafor/mass").MassDirectoryLease, server: Bun.Server<undefined>}>()
.processes(process => [
  process("start",{env:["server"]}).action(async ({mass,energy}) => {
    const mod = await import("./start.mjs")
    return mod.default({mass,energy})
  }).success(({update,data}) => update({input:null,runs:data.runs,port:data.port})).error(({update,error}) => update({error:error.message})),
  process("stop",{env:["server"]}).action(async ({energy}) => {
    const mod = await import("./stop.mjs")
    return mod.default({energy})
  }).success(({update}) => update({input:null})).error(({update,error}) => update({error:error.message}))
]).reactions().matter().bulk()`)
  const rootFile = join(artifacts, "root.json")
  await Bun.write(rootFile, JSON.stringify(declaration))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(declaration)}\n`)
  await Bun.write(join(artifacts, "start.mjs"), `import {readFile,writeFile} from "node:fs/promises"
import {join} from "node:path"
export default async ({mass,energy}) => {
  if(energy.lease) throw new Error("Previous writer not released")
  const lease = await mass.workspace.acquire()
  energy.lease = lease
  try {
    const file = join(lease.path,"profile.json")
    const prior = await readFile(file,"utf8").catch(error => {if(error.code==="ENOENT")return "0";throw error})
    const runs = Number(prior)+1
    await writeFile(file,String(runs))
    energy.server = Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>Response.json({aborted:lease.signal.aborted})})
    return {runs,port:energy.server.port}
  } catch(error) {await lease.release();delete energy.lease;throw error}
}`)
  await Bun.write(join(artifacts, "stop.mjs"), `export default async ({energy}) => {
  if(!energy.lease || energy.lease.signal.aborted) throw new Error("Stop lost its own live lease")
  await energy.server.stop(true)
  delete energy.server
  await energy.lease.release()
  delete energy.lease
}`)
  const executable = join(directory, "release.mjs")
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "../../cosmos/release/spec/fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    let persistedPath: string | undefined
    for (let run = 1; run <= 2; run++) {
      await Promise.all(["boundary","energy","matrix"].map(domain => rm(join(stateRoot,`fixture-${domain}.json`),{force:true})))
      const ready = Promise.withResolvers<{origin: string, children: {domain: string, pid: number}[]}>()
      child = Bun.spawn({cmd:[process.execPath,executable],cwd:directory,env:{...process.env,
        QUANTUM_FIXTURE_STATE:stateRoot,QUANTUM_FIXTURE_ROOT_FILE:rootFile,QUANTUM_FIXTURE_MASS_VALUE:undefined,
        QUANTUM_FIXTURE_LIFECYCLE:JSON.stringify({started:{field:"input",value:"started"},stopping:{field:"input",value:"stopping"}}),
        COSMOS_QUANTUM:"1",COSMOS_QUANTUM_DOMAIN:undefined,METAFOR_WEAK_BACKEND:"cpu",
        METAFOR_ROOT_META:undefined,METAFOR_ROOT_SOURCES:undefined,METAFOR_META_SOURCE_ROOT:undefined,
        METAFOR_META_ARTIFACT_ROOT:artifacts,METAFOR_META_ARTIFACT_MAP:JSON.stringify({"fixture/initialized":{directory:".",entry:"meta.mjs"}}),
        METAFOR_META_ARTIFACT_MAP_FILE:undefined,META_AUTHORING_RPC_SOURCE:undefined,META_AUTHORING_SCOPES:undefined,META_AUTHORING_CREATE_SCOPES:undefined,
      },stdout:"pipe",stderr:"pipe",ipc(message) {
        if(message && typeof message==="object" && "type" in message && message.type==="ready") ready.resolve(message as never)
      }})
      const current = child
      if (!(current.stdout instanceof ReadableStream) || !(current.stderr instanceof ReadableStream)) throw new Error("Directory fixture pipes unavailable")
      const stdout = new Response(current.stdout).text()
      const stderr = new Response(current.stderr).text()
      const evidence = await Promise.race([ready.promise,
        current.exited.then(async code => {throw new Error(`Directory fixture exited ${code}: ${await stderr}\n${await stdout}`)}),
        Bun.sleep(25_000).then(() => {throw new Error("Directory fixture readiness timed out")})])
      const transport = new OracleTransport(`directory-reader-${run}`,new URL(evidence.origin))
      const peer = new OracleRpcPeer(transport.channel)
      try {
        await transport.open({methods:[],waitMs:1000})
        const graph = await peer.call<Graph>("dark",READ_GRAPH_METHOD,{})
        const root = graph.runtime.roots.find(node => node.kind==="atom" && node.meta===graph.root)
        if(root?.kind!=="atom") throw new Error("Directory root missing")
        expect(root.values.error).toBeNull()
        expect(root.state).toBe("ready")
        expect(root.values.runs).toBe(run)
        const resource = `http://127.0.0.1:${root.values.port}`
        expect(await fetch(resource).then(response => response.json())).toEqual({aborted:false})
        const history = await peer.call<DarkForceHistoryReadReceipt>("dark",DARK_FORCE_HISTORY_READ_METHOD,{contractVersion:1,query:{kind:"frontier"}})
        await peer.call("dark",META_FIELD_VALUE_APPLY_METHOD,{contractVersion:1,atom:{root:graph.root,ref:root.ref,meta:root.meta},field:"probe",value:run===1,expectedFrontier:history.frontier})
        await peer.call("dark",READ_GRAPH_METHOD,{})
        expect(await fetch(resource).then(response => response.json())).toEqual({aborted:false})
        expect(root.mass[0]?.format).toBe("directory")
        expect(JSON.stringify(graph)).not.toContain(stateRoot)
        await expect(peer.call("energy",ENERGY_MASS_RESULT_READ_METHOD,{contractVersion:1,atom:{root:graph.root,ref:root.ref,meta:root.meta},key:"workspace",maxBytes:4096})).rejects.toThrow("temporarily unsupported")
        const entries = (await readdir(join(stateRoot,"mass"))).filter(name => name.endsWith(".dir"))
        expect(entries).toHaveLength(1)
        const path = join(stateRoot,"mass",entries[0]!,"profile.json")
        if(persistedPath) expect(path).toBe(persistedPath)
        persistedPath=path
        expect(await Bun.file(path).text()).toBe(String(run))
      } finally {peer.close();await transport.close()}
      current.send("hold-and-stop")
      await Promise.race([current.exited,Bun.sleep(15_000).then(() => {throw new Error("Directory fixture stop timed out")})])
      expect(current.exitCode,await stderr).toBe(0)
      expect(await Bun.file(persistedPath!).text()).toBe(String(run))
      for(const entry of evidence.children) expect(() => process.kill(entry.pid,0)).toThrow()
      child=undefined
    }
  } finally {
    if(child?.exitCode===null) {
      child.send("stop")
      await Promise.race([child.exited,Bun.sleep(10_000)])
      if(child.exitCode===null)child.kill("SIGKILL")
      await child.exited
    }
    await rm(directory,{recursive:true,force:true})
  }
},75_000)
