import {mock,expect} from "bun:test"
import {agent,methods,PROTOCOL_VERSION,type AnyMessage} from "@agentclientprotocol/sdk"
import peer from "@zavx0z/provider-tech-peer"
import browserPeer from "@zavx0z/provider-tech-peer/browser"
import type {PeerNetwork} from "@metafor/tech-peer"
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"

type Data={peerId:string;channel:string;data:Uint8Array|string}
const data=new Map<string,Set<(value:Data)=>void>>()
type Snapshot=ReturnType<PeerNetwork["snapshot"]>
const connected=new Set<string>()
const connects:string[]=[]
const closes:string[]=[]
let factories=0,frames=0,initializations=0,sessions=0,prompts=0
let mode:"success"|"failure"|"hold"="success"
let releaseConnect:()=>void=()=>{}
let initializeBarrier:Promise<void>=Promise.resolve()
let rejectInitialize=false,nativeActive=true
const wait=async(check:()=>boolean)=>{const deadline=Date.now()+2000;while(!check()){if(Date.now()>deadline)throw new Error("Fixture timed out");await Bun.sleep(1)}}
function network(id:string):PeerNetwork{
  let closed=false
  let opening:Promise<void>|undefined
  const listeners=new Set<(value:Data)=>void>(),observers=new Set<(snapshot:Snapshot)=>void>()
  data.set(id,listeners)
  return{id,
    async connect(remote){
      expect(remote).toBe("host")
      connects.push(id+":"+remote)
      if(mode==="failure")throw new Error("Assigned link failed")
      if(mode==="hold")await(opening??=new Promise<void>(resolve=>{releaseConnect=resolve}))
      if(closed)throw new Error("Lease closed")
      connected.add(id)
    },
    async send(remote,payload,options){
      const recipient=id==="host"?remote:"host"
      if(id!=="host"&&!connected.has(id))throw new Error("Peer is not connected")
      frames++
      await Promise.resolve()
      for(const listener of data.get(recipient)??[])listener({peerId:id,channel:options?.channel??"",data:payload})
    },
    onData(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
    subscribe(listener){observers.add(listener);return()=>{observers.delete(listener)}},
    snapshot(){return{id,peers:["host"],bootstrap:!closed,links:connected.has(id)?[{peerId:"host",state:"open",generation:"fixture",transport:"relay"}]:[]}},
    async disconnect(){},closeBootstrap(){},
    async close(){closed=true;closes.push(id);connected.delete(id);releaseConnect();for(const listener of observers)listener({id,peers:["host"],bootstrap:false,links:[]})},
  }
}
mock.module("@metafor/tech-peer/signaling",()=>({connectWebSocketSignaling:async()=>({close(){}})}))
mock.module("@metafor/tech-peer/werift",()=>({createWeriftPeerConnectionFactory:()=>()=>{throw new Error("No real RTC in fixture")}}))
mock.module("@metafor/tech-peer",()=>({createPeerNetwork:(options:{id:string})=>{factories++;return network(options.id)},createRoutedPeerNetwork:(options:{id:string})=>{factories++;return network(options.id)}}))
const hostNetwork=network("host")
const host=peer.createPeerHost({network:hostNetwork,authorize:(id,executor)=>id==="consumer"&&executor==="browser",executors:{browser:{cwd:"/",async open(){
  const incoming=new TransformStream<AnyMessage,AnyMessage>(),outgoing=new TransformStream<AnyMessage,AnyMessage>()
  const server=agent({name:"fixture"}).onRequest(methods.agent.initialize,async()=>{initializations++;await initializeBarrier;if(rejectInitialize)throw new Error("ACP unavailable");return{protocolVersion:PROTOCOL_VERSION,agentCapabilities:{}}})
    .onRequest(methods.agent.session.new,()=>{sessions++;return{sessionId:"must-not-create"}})
    .onRequest(methods.agent.session.prompt,()=>{prompts++;return{stopReason:"end_turn" as const}})
    .connect({readable:incoming.readable,writable:outgoing.writable})
  return{stream:{readable:outgoing.readable,writable:incoming.writable},closed:server.closed.then(()=>{}),async dispose(){server.close()}}
}}}})
const native=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>Response.json({ok:true,sessions:[{profileName:"assigned",active:nativeActive,containerState:"running",instanceId:"native-instance"}]})})
const browser=browserPeer.createBrowserPeerHost({network:hostNetwork,authorize:(id,executor)=>["viewer","consumer"].includes(id)&&executor==="browser",executors:{browser:{provider:"capsule",endpoint:{url:`http://127.0.0.1:${native.port}`,profile:"assigned"}}}})
const directory=await mkdtemp(join(tmpdir(),"provider-native-link-"))
const config=join(directory,"providers.json"),token=join(directory,"token")
await writeFile(token,"fixture-only-owner-private-token",{mode:0o600})
await writeFile(config,JSON.stringify({version:1,hosts:{assigned:{peerId:"host",network:{peerId:"consumer",viewerPeerId:"viewer",conversationPeerId:"conversations",signalingUrl:"ws://127.0.0.1:9/peer",tokenFile:token,relay:true}}},bindings:{selected:{service:"chatgpt",host:"assigned",executorId:"browser",connection:{id:"selected",provider:"capsule",label:"Assigned Capsule",enabled:true,endpoint:{url:`http://127.0.0.1:${native.port}`,profile:"assigned",service:"chatgpt"}}}}}),{mode:0o600})
process.env.ORACLE_AGENT_PROVIDER_CONFIG=config
const {checkProviderBinding,checkProviderRegistration,authorizedProviderDriver,authorizedProviderBrowserClient,authorizedProviderPeerLease,parseNativeProviderCapabilities,resolveConfiguredProvider,readProviderOptions}=await import("../driver")
const binding={id:"selected",service:"chatgpt",host:"assigned",remotePeerId:"host",executorId:"browser"}
try{
  const which=process.argv[2]
  if(which==="reuse"){
    await Promise.all([checkProviderBinding(binding,AbortSignal.timeout(2000)),checkProviderBinding(binding,AbortSignal.timeout(2000))])
    expect(factories).toBe(1)
    expect(connects).toEqual(["consumer:host","consumer:host"])
    expect(closes).toEqual(["consumer"])
    expect(initializations).toBe(2)
  }else if(which==="failure"){
    mode="failure"
    await expect(checkProviderBinding(binding,AbortSignal.timeout(2000))).rejects.toThrow("Assigned link failed")
    expect(frames).toBe(0)
    expect(closes).toEqual(["consumer"])
    mode="success"
    await checkProviderBinding(binding,AbortSignal.timeout(2000))
    expect(factories).toBe(2)
    expect(initializations).toBe(1)
  }else if(which==="abort"){
    mode="hold"
    const abort=new AbortController()
    const checking=checkProviderBinding(binding,abort.signal)
    await wait(()=>connects.length===1)
    abort.abort(new Error("Caller cancelled"))
    await expect(checking).rejects.toThrow("Caller cancelled")
    expect(frames).toBe(0)
    expect(closes).toEqual(["consumer"])
    expect(initializations).toBe(0)
  }else if(which==="shared-abort"){
    mode="hold"
    const abort=new AbortController()
    const first=checkProviderBinding(binding,abort.signal)
    const second=checkProviderBinding(binding,AbortSignal.timeout(2000))
    await wait(()=>connects.length===2)
    abort.abort(new Error("First caller cancelled"))
    await expect(first).rejects.toThrow("First caller cancelled")
    expect(closes).toEqual([])
    releaseConnect()
    await second
    expect(factories).toBe(1)
    expect(initializations).toBe(1)
    expect(closes).toEqual(["consumer"])
  }else if(which==="conversation-policy"){
    const configured=JSON.parse(await readFile(config,"utf8"))
    for(const conversationPeerId of ["consumer","viewer","host","invalid identity"]){
      const altered=structuredClone(configured)
      altered.hosts.assigned.network.conversationPeerId=conversationPeerId
      expect(()=>parseNativeProviderCapabilities(altered)).toThrow()
    }
    delete configured.hosts.assigned.network.conversationPeerId
    expect(parseNativeProviderCapabilities(configured).hosts.assigned!.network.peerId).toBe("consumer")
    await writeFile(config,JSON.stringify(configured))
    await expect(authorizedProviderPeerLease(binding,AbortSignal.timeout(2000))).rejects.toThrow("separate native conversation identity")
    expect(factories).toBe(0)
  }else if(which==="conversation"){
    let finish!:()=>void
    initializeBarrier=new Promise<void>(resolve=>{finish=resolve})
    const checking=checkProviderBinding(binding,AbortSignal.timeout(2000))
    await wait(()=>initializations===1)
    const first=await authorizedProviderPeerLease(binding,AbortSignal.timeout(2000))
    const second=await authorizedProviderPeerLease(binding,AbortSignal.timeout(2000))
    expect(first.network.id).toBe("conversations")
    expect(second.network).toBe(first.network)
    expect(connects).toEqual(["consumer:host","conversations:host","conversations:host"])
    await first.close()
    expect(closes).toEqual([])
    await second.close()
    expect(closes).toEqual(["conversations"])
    finish()
    await checking
    expect(closes).toEqual(["conversations","consumer"])
  }else if(which==="viewer"){
    let finish!:()=>void
    initializeBarrier=new Promise<void>(resolve=>{finish=resolve})
    const checking=checkProviderBinding(binding,AbortSignal.timeout(2000))
    await wait(()=>initializations===1)
    const lease=await authorizedProviderBrowserClient(binding,AbortSignal.timeout(2000))
    expect(await lease.client.describe({peerId:"host",executorId:"browser"})).toMatchObject({instanceId:"native-instance",profile:"assigned"})
    await lease.close()
    expect(connects).toEqual(["consumer:host","viewer:host"])
    expect(closes).toEqual(["viewer"])
    finish()
    await checking
    expect(closes).toEqual(["viewer","consumer"])
  }else if(which==="register"||which==="register-preview"||which==="register-timeout"){
    rejectInitialize=which==="register-preview"
    if(which==="register-timeout"){
      initializeBarrier=new Promise(()=>{})
      const originalTimeout=AbortSignal.timeout.bind(AbortSignal)
      AbortSignal.timeout=milliseconds=>originalTimeout(milliseconds===15000?30:milliseconds)
    }
    const checked=await checkProviderRegistration(binding,AbortSignal.timeout(3000))
    expect(checked).toMatchObject({connection:"connected",capabilities:{modelTurn:which==="register",browserPreview:true,browserControl:true},checks:{status:"unknown"}})
    expect(checked.checks.message).toContain("login and model response remain unchecked")
    expect(connects).toEqual(["consumer:host","consumer:host"])
    expect(factories).toBe(1)
    expect(initializations).toBe(1)
  }else if(which==="register-configured"){
    const connection={id:"new-ui-connection",provider:"capsule" as const,label:"New Capsule",enabled:true,endpoint:{url:`http://127.0.0.1:${native.port}`,profile:"assigned",service:"chatgpt" as const}}
    const resolved=await resolveConfiguredProvider(connection,[])
    expect(resolved).toEqual(binding)
    expect(factories).toBe(0)
    expect(await checkProviderRegistration(resolved,AbortSignal.timeout(3000))).toMatchObject({connection:"connected",capabilities:{modelTurn:true,browserPreview:true}})
    for(const endpoint of [{...connection.endpoint,profile:"foreign"},{...connection.endpoint,url:"http://127.0.0.1:1"}]){
      await expect(resolveConfiguredProvider({...connection,endpoint},[])).rejects.toThrow("назначение")
    }
  }else if(which==="register-ollama-peer"){
    const configured=JSON.parse(await readFile(config,"utf8"))
    const connection={id:"ollama-ui",provider:"ollama" as const,label:"Assigned Ollama peer",enabled:true,endpoint:{url:"http://127.0.0.1:11434"},peer:{peerId:"host",executorId:"browser"}}
    configured.bindings.selected={service:"ollama",host:"assigned",executorId:"browser",assignmentId:"ollama-v1",connection}
    await writeFile(config,JSON.stringify(configured))
    const expected={...binding,service:"ollama",assignmentId:"ollama-v1"}
    const resolved=await resolveConfiguredProvider(connection,[])
    expect(resolved).toEqual(expected)
    expect((await authorizedProviderDriver(resolved)).binding).toEqual(expected)
    for(const foreign of [{...resolved,assignmentId:"foreign"},{...resolved,remotePeerId:"foreign"},{...resolved,executorId:"foreign"}]){
      await expect(authorizedProviderDriver(foreign)).rejects.toThrow("outside its assigned")
      await expect(authorizedProviderPeerLease(foreign,AbortSignal.timeout(2000))).rejects.toThrow("outside its assigned")
    }
    for(const altered of [{...connection,enabled:false},{...connection,endpoint:{url:"http://127.0.0.1:11435"}},{...connection,endpoint:{url:""}},
      {...connection,peer:{peerId:"foreign",executorId:"browser"}},{...connection,peer:{peerId:"host",executorId:"foreign"}}]){
      await expect(resolveConfiguredProvider(altered,[])).rejects.toThrow()
    }
    delete configured.bindings.selected.connection
    await writeFile(config,JSON.stringify(configured))
    await expect(resolveConfiguredProvider(connection,[])).rejects.toThrow("назначение")
    configured.bindings.selected.connection=connection
    await writeFile(config,JSON.stringify(configured))
    await expect(readProviderOptions(resolved,undefined,AbortSignal.timeout(2000))).rejects.toThrow("независимый каталог")
    expect(factories).toBe(0)
    const checked=await checkProviderRegistration(resolved,AbortSignal.timeout(2000))
    expect(checked).toMatchObject({connection:"connected",capabilities:{modelTurn:true,browserPreview:false,browserControl:false},checks:{status:"unknown"}})
    expect(checked.checks.message).toContain("ACP admission confirmed")
    expect(initializations).toBe(1)
    const lease=await authorizedProviderPeerLease(resolved,AbortSignal.timeout(2000))
    expect(lease.network.id).toBe("conversations")
    await lease.close()
    expect(connects).toEqual(["consumer:host","conversations:host"])
    expect(closes).toEqual(["consumer","conversations"])
    configured.bindings["native-ollama"]=configured.bindings.selected
    delete configured.bindings.selected
    await writeFile(config,JSON.stringify(configured))
    const collision=await resolveConfiguredProvider(connection,[])
    expect(collision).toEqual({...expected,id:"native-ollama"})
    expect((await authorizedProviderDriver(collision)).binding).toEqual(collision)
    expect((await checkProviderRegistration(collision,AbortSignal.timeout(2000))).checks.message).toContain("ACP admission confirmed")
    expect(initializations).toBe(2)
  }else if(which==="register-denied"){
    nativeActive=false
    await expect(checkProviderRegistration(binding,AbortSignal.timeout(3000))).rejects.toThrow("Browser peer executor unavailable")
    expect(connects).toEqual(["consumer:host"])
    expect(initializations).toBe(0)
  }else if(which==="register-with-viewer"){
    const viewer=await authorizedProviderBrowserClient(binding,AbortSignal.timeout(3000))
    expect(await viewer.client.describe({peerId:"host",executorId:"browser"})).toMatchObject({instanceId:"native-instance"})
    let finish!:()=>void
    initializeBarrier=new Promise<void>(resolve=>{finish=resolve})
    const checking=checkProviderRegistration(binding,AbortSignal.timeout(3000))
    await wait(()=>initializations===1)
    expect(closes).toEqual([])
    // HUD describe succeeds while the independent model validation is still pending.
    expect(await viewer.client.describe({peerId:"host",executorId:"browser"})).toMatchObject({instanceId:"native-instance"})
    finish()
    const checked=await checking
    expect(checked).toMatchObject({connection:"connected",capabilities:{modelTurn:true,browserPreview:true,browserControl:true},checks:{status:"unknown"}})
    expect(connects).toEqual(["viewer:host","consumer:host","consumer:host"])
    expect(factories).toBe(2)
    expect(closes).toEqual(["consumer"])
    expect(await viewer.client.describe({peerId:"host",executorId:"browser"})).toMatchObject({instanceId:"native-instance"})
    await viewer.close()
    expect(closes).toEqual(["consumer","viewer"])
    expect(initializations).toBe(1)
  }else if(which==="register-unassigned"){
    await expect(checkProviderRegistration({...binding,executorId:"foreign"},AbortSignal.timeout(3000))).rejects.toThrow("outside its assigned")
    expect(connects).toEqual([])
    expect(frames).toBe(0)
  }else throw new Error("Unknown case")
  expect(sessions).toBe(0)
  expect(prompts).toBe(0)
  console.log(JSON.stringify({case:which,passed:true,factories,connects,closes,initializations,sessions,prompts}))
}finally{await browser.close();await host.close();native.stop(true);await rm(directory,{recursive:true,force:true})}
