import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readFile, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {evaluateMetaSource} from "../../../../quantum/dark/load"
import {OracleRpcPeer, OracleTransport} from "shared/transport/oracle"
import {READ_GRAPH_METHOD, type Graph} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {createInstalledReleaseStore} from "@metafor/tech-release/installed"
import {createHash} from "node:crypto"

test("actual Capsule runtime Meta keeps its owned child alive at ready and through quiesce, then stops and restores it", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "capsule-quantum-lifetime-")))
  const capsuleRoot = resolve(import.meta.dir, "../../../../../capsule")
  const stateRoot = join(directory, "state")
  const artifacts = join(directory, "artifacts")
  await mkdir(stateRoot)
  await mkdir(artifacts)
  const executable = join(directory, "quantum.mjs")
  const image = `sha256:${"a".repeat(64)}`
  const probe = Bun.serve({hostname: "127.0.0.1", port: 0, fetch: () => new Response()})
  const port = probe.port!
  await probe.stop(true)
  const configuration = {hostname: "127.0.0.1", port, environment: {CAPSULE_RUNTIME_IMAGE_DESKTOP_AUDIO_MICROPHONE: image, CAPSULE_RTC_PUBLIC_ICE_HOST: "192.0.2.10"}}
  const runtime = await evaluateMetaSource(await readFile(Bun.resolveSync("@capsule/runtime/meta", capsuleRoot), "utf8"))
  const buildModule = async (name: string, source: string) => {
    const folder = join(artifacts, "process", name)
    await mkdir(folder, {recursive: true})
    const input = join(folder, "source.ts")
    await Bun.write(input, source)
    const built = await Bun.build({entrypoints: [input], target: "bun", format: "esm", conditions: ["cosmos:server", "internal:server"]})
    expect(built.success, built.logs.map(String).join("\n")).toBeTrue()
    await Bun.write(join(folder, "index.mjs"), built.outputs[0]!)
    await rm(input)
    return `./process/${name}/index.mjs`
  }
  const native = `const containers={inspect:async receipt=>({instanceId:receipt.instanceId,name:'capsule-'+receipt.instanceId,state:'running',containerId:'synthetic-'+receipt.instanceId,imageId:${JSON.stringify(image)},launchDigest:'fixture',runtimeId:'desktop-audio-microphone'}),stop:async receipt=>({instanceId:receipt.instanceId,name:'capsule-'+receipt.instanceId,state:'absent'})};`
  const modules = new Map<string, string>()
  for (const [name, dependency] of [["prepare", "{containers}"], ["provision", "undefined"], ["launch", "{requireImage:async()=>{}}"], ["open", "{containers}"], ["stop", "{containers}"]] as const) {
    const specifier = `@capsule/runtime-${name}`
    const entry = Bun.resolveSync(specifier, capsuleRoot)
    modules.set(specifier, await buildModule(name, `import factory from ${JSON.stringify(entry)};${native}export default input=>factory(input,${dependency})`))
  }
  for (const process of runtime.processes ?? []) {
    if (process.declaration.type === "action") {
      const src = process.declaration.action.src!
      const target = modules.get(src)
      if (!target) throw new Error(`Unexpected actual Capsule Process ${src}`)
      process.declaration.action.src = target
      if (process.declaration.action.wrapperSrc) process.declaration.action.wrapperSrc = process.declaration.action.wrapperSrc.replaceAll(src, target)
    } else if (process.declaration.type === "finally") {
      process.declaration.before.src = process.declaration.before.src.replaceAll("@capsule/runtime-stop", modules.get("@capsule/runtime-stop")!)
    }
  }
  const request = Bun.resolveSync("@cosmos/peer-lifecycle", process.cwd())
  await buildModule("request-start", `import request from ${JSON.stringify(request)};export default({signal})=>({...request({event:'started',signal}),configuration:process.env.CAPSULE_QUANTUM_FIXTURE_CONFIGURATION??null})`)
  await buildModule("request-stop", `import request from ${JSON.stringify(request)};export default({signal})=>request({event:'stopping',signal})`)
  const root = await evaluateMetaSource(`export default MetaFor("Capsule lifetime fixture")
.fields(field=>({input:field.string.optional(),request:field.string.optional(),requestId:field.string.required(''),ack:field.boolean.required(false),ackId:field.string.required(''),status:field.string.required('stopped'),error:field.string.optional(),configuration:field.string.optional(),profileName:field.string.required('synthetic'),templatePath:field.string.required('browser-agent/03-desktop-audio-microphone.yaml'),saveId:field.string.optional(),instanceId:field.string.optional(),capsuleUrl:field.string.optional()}))
.lifecycle({started:{field:'input',value:'started'},stopping:{field:'input',value:'stopping'}})
.superposition({waiting:{starting:{input:{eq:'started'}}},starting:{'waiting-ready':{}},'waiting-ready':{ready:{ack:{eq:true}},failed:{error:{null:false}}},ready:{stopping:{input:{eq:'stopping'}},starting:{input:{eq:'started'}}},stopping:{'waiting-stop':{}},'waiting-stop':{stopped:{ack:{eq:true}},failed:{error:{null:false}}},stopped:{starting:{input:{eq:'started'}}},failed:null})
.mass(()=>({})).energy().processes(process=>[
process('starting',{env:['server']}).action(async({signal})=>{const mod=await import('./process/request-start/index.mjs');return mod.default({signal})}).success(({update,data})=>update({request:data.request,requestId:data.requestId,ack:false,error:null,input:null,configuration:data.configuration})),
process('stopping',{env:['server']}).action(async({signal})=>{const mod=await import('./process/request-stop/index.mjs');return mod.default({signal})}).success(({update,data})=>update({request:data.request,requestId:data.requestId,ack:false,error:null,input:null}))])
.reactions().matter(({value,html})=>html\`<meta-for src="@capsule/runtime" fields=\${{request:value.request,requestId:value.requestId,ack:value.ack,ackId:value.ackId,status:value.status,error:value.error,configuration:value.configuration,profileName:value.profileName,templatePath:value.templatePath,saveId:value.saveId,instanceId:value.instanceId,capsuleUrl:value.capsuleUrl}} />\`).bulk()`)
  const rootFile = join(artifacts, "root.json")
  const childFile = join(artifacts, "child.json")
  await Bun.write(rootFile, JSON.stringify(root))
  await Bun.write(childFile, JSON.stringify(runtime))
  await Bun.write(join(artifacts, "meta.mjs"), `export default ${JSON.stringify(root)}`)
  await Bun.write(join(artifacts, "child-meta.mjs"), `export default ${JSON.stringify(runtime)}`)
  const fixtureBuild = await Bun.build({entrypoints: [resolve(import.meta.dir, "../../../release/spec/fixture/quantum.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(fixtureBuild.success, fixtureBuild.logs.map(String).join("\n")).toBeTrue()
  await Bun.write(executable, fixtureBuild.outputs[0]!)
  const script = `const sessions=[];const server=Bun.serve({hostname:process.env.CAPSULE_HOST,port:Number(process.env.CAPSULE_PORT),fetch:async request=>{const path=new URL(request.url).pathname;if(path.endsWith('/state'))return Response.json({ok:true,sessions});if(path==='/api/studio/profiles')return Response.json({ok:true,profiles:[]});if(path.endsWith('/create-and-open')){const value=await request.json();sessions.push({profileName:value.name,instanceId:value.instanceId,mode:'edit',templatePath:value.templatePath});return Response.json({ok:true,result:{instanceId:value.instanceId}})}return new Response('owned-child:'+process.pid)}});process.send({type:'capsule.ready',origin:server.url.origin});const stop=async()=>{await server.stop(true);process.disconnect?.()};process.on('message',message=>{if(message.type==='capsule.stop')void stop();if(message.type==='capsule.quiesce')process.send({type:'capsule.quiesced',requestId:message.requestId,ok:true})});process.on('disconnect',()=>void server.stop(true));`
  const bytes = new TextEncoder().encode(script)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const storeRoot = join(directory, "installed")
  const installed = await createInstalledReleaseStore({root: storeRoot}).prepare({schemaVersion: 1, packages: [{name: "@capsule/server", version: "0.1.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {"./entry": ".mjs"}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", sha256, size: bytes.length}, {artifact: "./entry", kind: "entry-point", type: "text/javascript", sha256, size: bytes.length}]}]}]}, {read: async () => bytes})
  let current: ReturnType<typeof Bun.spawn> | undefined
  try {
    for (let run = 0; run < 2; run++) {
      const ready = Promise.withResolvers<{origin: string; children: {pid: number; domain: string}[]; initialization: {mode: string}}>()
      current = Bun.spawn({cmd: [process.execPath, executable], cwd: directory, env: {...process.env, QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_ROOT_FILE: rootFile, QUANTUM_FIXTURE_LIFECYCLE: undefined, QUANTUM_FIXTURE_MASS_VALUE: undefined, COSMOS_QUANTUM: "1", COSMOS_QUANTUM_DOMAIN: undefined, METAFOR_WEAK_BACKEND: "cpu", METAFOR_ROOT_META: undefined, METAFOR_ROOT_SOURCES: undefined, METAFOR_META_SOURCE_ROOT: undefined, METAFOR_META_ARTIFACT_ROOT: artifacts, METAFOR_META_ARTIFACT_MAP: JSON.stringify({"fixture/initialized": {directory: ".", entry: "meta.mjs"}, "@capsule/runtime": {directory: ".", entry: "child-meta.mjs"}}), METAFOR_META_ARTIFACT_MAP_FILE: undefined, COSMOS_RELEASE_STORE: storeRoot, COSMOS_RELEASE_DIGEST: installed.digest, CAPSULE_QUANTUM_FIXTURE_CONFIGURATION: run === 0 ? JSON.stringify(configuration) : undefined, META_AUTHORING_RPC_SOURCE: undefined, META_AUTHORING_SCOPES: undefined, META_AUTHORING_CREATE_SCOPES: undefined}, stdout: "pipe", stderr: "pipe", ipc(message) {if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as never)}})
      const processHandle = current
      if (!(processHandle.stderr instanceof ReadableStream) || !(processHandle.stdout instanceof ReadableStream)) throw new Error("Fixture output streams unavailable")
      const stderr = new Response(processHandle.stderr).text()
      const stdout = new Response(processHandle.stdout).text()
      const evidence = await Promise.race([ready.promise, processHandle.exited.then(async code => {throw new Error(`Quantum fixture exited ${code}: ${await stderr}\n${await stdout}`)}), Bun.sleep(25_000).then(() => {throw new Error("Capsule Quantum readiness timed out")})])
      expect(evidence.initialization.mode).toBe(run === 0 ? "initialized" : "restored")
      const transport = new OracleTransport(`capsule-lifetime-${run}`, new URL(evidence.origin))
      const peer = new OracleRpcPeer(transport.channel)
      let origin: string
      try {
        await transport.open({methods: [], waitMs: 1000})
        const graph = await peer.call<Graph>("dark", READ_GRAPH_METHOD, {})
        const atom = graph.runtime.roots.find(node => node.kind === "atom")
        if (atom?.kind !== "atom") throw new Error("Root Atom missing")
        expect(atom.state, JSON.stringify(atom.values)).toBe("ready")
        expect(atom.values.error).toBeNull()
        const browser = atom.children?.find(node => node.kind === "atom" && node.meta === "@capsule/runtime")
        if (browser?.kind !== "atom") throw new Error("Actual runtime Atom missing")
        expect(browser.state).toBe("ready")
        expect(browser.values.status).toBe("running")
        origin = String(atom.values.capsuleUrl)
        expect(await fetch(origin).then(response => response.text())).toStartWith("owned-child:")
        // Another causal Graph read includes a complete fixed-point drain; ready must not run finally.
        await peer.call<Graph>("dark", READ_GRAPH_METHOD, {})
        expect(await fetch(origin).then(response => response.text())).toStartWith("owned-child:")
      } finally {peer.close(); await transport.close()}
      processHandle.send("hold-and-stop")
      await Promise.race([processHandle.exited, Bun.sleep(15_000).then(() => {throw new Error("Capsule Quantum shutdown timed out")})])
      expect(processHandle.exitCode, await stderr).toBe(0)
      await stdout
      await expect(fetch(origin!)).rejects.toThrow()
      for (const child of evidence.children) expect(() => process.kill(child.pid, 0)).toThrow()
      current = undefined
      if (run === 0) {await rm(rootFile); await rm(childFile)}
    }
  } finally {
    if (current?.exitCode === null) {current.kill("SIGTERM"); await current.exited}
    await rm(directory, {recursive: true, force: true})
  }
}, 90_000)
