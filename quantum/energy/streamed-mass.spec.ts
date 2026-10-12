import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readdir, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {evaluateMetaSource} from "../dark/load"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {READ_GRAPH_METHOD, type Graph} from "@metafor/types/metafor/graph"

test("first streamed root import grants JSON and binary filesystem handles to the real Energy Process", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "metafor-streamed-mass-")))
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "artifacts")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  const declaration = await evaluateMetaSource(`export default MetaFor("Streamed Mass")
.fields(field => ({input:field.string.optional(),finished:field.boolean.required(false),error:field.string.optional()}))
.superposition({waiting:{write:{input:{eq:"started"}}},write:{done:{finished:{eq:true}}},done:null})
.mass(mass => ({stats:mass.json(),payload:mass.binary()})).energy()
.processes(process => [process("write",{env:["server"]})
.action(async ({mass}) => {
  const mod = await import("./write.mjs")
  return mod.default({mass})
})
.success(({update}) => update({finished:true}))
.error(({error,update}) => update({error:error.message}))])
.reactions().matter().bulk()`)
  const rootFile = join(artifacts, "root.json")
  await Bun.write(rootFile, JSON.stringify(declaration))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(declaration)}\n`)
  await Bun.write(join(artifacts, "write.mjs"), `export default async ({mass}) => {
    const text = await mass.stats.readText()
    if (text) throw new Error("First import unexpectedly has persisted JSON bytes")
    await mass.stats.write({runs:1})
    await mass.payload.write(new Uint8Array([0,255,4]))
    const stats = await mass.stats.readJson()
    const payload = await mass.payload.readBytes()
    if(stats.runs!==1 || payload.join(",")!=="0,255,4") throw new Error("Mass round trip failed")
  }`)
  const executable = join(directory, "release.mjs")
  const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "../../cosmos/release/spec/fixture/quantum.ts")], target: "bun",
    conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, build.outputs[0]!)
  const ready = Promise.withResolvers<{origin: string, children: {domain: string, pid: number}[]}>()
  const child = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env,
    QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile,
    QUANTUM_FIXTURE_LIFECYCLE: JSON.stringify({started:{field:"input",value:"started"}}),
    QUANTUM_FIXTURE_MASS_VALUE: undefined, COSMOS_QUANTUM: "1", COSMOS_QUANTUM_DOMAIN: undefined,
    METAFOR_WEAK_BACKEND: "cpu", METAFOR_ROOT_META: undefined, METAFOR_ROOT_SOURCES: undefined,
    METAFOR_META_SOURCE_ROOT: undefined, METAFOR_META_ARTIFACT_ROOT: artifacts,
    METAFOR_META_ARTIFACT_MAP: JSON.stringify({"fixture/initialized":{directory:".",entry:"meta.mjs"}}),
    METAFOR_META_ARTIFACT_MAP_FILE: undefined, META_AUTHORING_RPC_SOURCE: undefined,
    META_AUTHORING_SCOPES: undefined, META_AUTHORING_CREATE_SCOPES: undefined,
  }, stdout:"pipe", stderr:"pipe", ipc(message) {
    if(message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as never)
  }})
  const stdout = new Response(child.stdout).text()
  const stderr = new Response(child.stderr).text()
  try {
    const evidence = await Promise.race([ready.promise,
      child.exited.then(async code => {throw new Error(`Streamed Mass child exited ${code}: ${await stderr}\n${await stdout}`)}),
      Bun.sleep(25_000).then(() => {throw new Error("Streamed Mass readiness timed out")})])
    const transport = new OracleTransport("streamed-mass-reader", new URL(evidence.origin))
    const peer = new OracleRpcPeer(transport.channel)
    try {
      await transport.open({methods:[],waitMs:1000})
      const graph = await peer.call<Graph>("dark",READ_GRAPH_METHOD,{})
      const root = graph.runtime.roots.find(node => node.kind === "atom" && node.meta === graph.root)
      if(root?.kind !== "atom") throw new Error("Streamed root Atom missing")
      expect(root.values.error).toBeNull()
      expect(root.values.finished).toBeTrue()
      expect(root.state).toBe("done")
      const files = await readdir(join(stateRoot,"mass"))
      const json = files.filter(name => name.endsWith(".json"))
      const binary = files.filter(name => name.endsWith(".bin"))
      expect(json).toHaveLength(1)
      expect(binary).toHaveLength(1)
      expect(await Bun.file(join(stateRoot,"mass",json[0]!)).json()).toEqual({runs:1})
      expect([...new Uint8Array(await Bun.file(join(stateRoot,"mass",binary[0]!)).arrayBuffer())]).toEqual([0,255,4])
    } finally {peer.close();await transport.close()}
    child.send("stop")
    await Promise.race([child.exited,Bun.sleep(10_000).then(() => {throw new Error("Streamed Mass shutdown timed out")})])
    expect(child.exitCode,await stderr).toBe(0)
    for(const entry of evidence.children) expect(() => process.kill(entry.pid,0)).toThrow()
  } finally {
    if(child.exitCode === null) {
      child.send("stop")
      await Promise.race([child.exited,Bun.sleep(10_000)])
      if(child.exitCode === null) child.kill("SIGKILL")
      await child.exited
    }
    await rm(directory,{recursive:true,force:true})
  }
},45_000)
