import {expect,test} from "bun:test"
import {mkdir,mkdtemp,realpath,rm,writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join,resolve} from "node:path"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {parsePeerNetworkObservation,peerObservationRequest,type PeerNetworkObservation} from "../shared/peer-observation"

type Ready={type:"ready";origin:string;children:{domain:string;pid:number;context:string|null}[]}
async function deadline<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms)})])}
  finally{clearTimeout(timer)}
}

test("two compiled four-domain peers report actual Oracle/Force RTC links through authenticated local telemetry and clear disconnection",async()=>{
  const directory=await realpath(await mkdtemp(join(tmpdir(),"metafor-observed-worlds-")))
  const executable=join(directory,"release.mjs")
  const token="fixture-private-room-observation"
  const tokenFile=join(directory,"token")
  await writeFile(tokenFile,token,{mode:0o600})
  const broker=createRendezvousServer({token,relay:true})
  const running=new Set<ReturnType<typeof Bun.spawn>>()
  const viewers=new Set<WebSocket>()
  try {
    const build=await Bun.build({entrypoints:[resolve(import.meta.dir,"fixture/network-observation.ts")],target:"bun",
      conditions:["cosmos:server","internal:server"],loader:{".wgsl":"text"},external:["bun-webgpu"]})
    expect(build.success,build.logs.map(String).join("\n")).toBeTrue()
    expect(build.outputs).toHaveLength(1)
    await Bun.write(executable,build.outputs[0]!)
    const start=async(id:string,other:string)=>{
      const stateRoot=join(directory,id)
      await mkdir(stateRoot)
      const ready=Promise.withResolvers<Ready>()
      const child=Bun.spawn({cmd:[process.execPath,executable],cwd:directory,env:{...process.env,
        OBSERVATION_STATE_ROOT:stateRoot,OBSERVATION_PEER_CONFIGURATION:JSON.stringify({id,allowedPeers:[other],tokenFile,signalingUrl:broker.url,iceServers:[]}),
        OBSERVATION_ENERGY_CONTEXT:"must-not-leak-to-other-domains",METAFOR_WEAK_BACKEND:"cpu",
        COSMOS_QUANTUM_DOMAIN:undefined,METAFOR_ROOT_SOURCES:undefined,METAFOR_META_SOURCE_ROOT:undefined,
        METAFOR_META_ARTIFACT_ROOT:undefined,METAFOR_META_ARTIFACT_MAP:undefined,METAFOR_META_ARTIFACT_MAP_FILE:undefined,
        META_AUTHORING_RPC_SOURCE:undefined,META_AUTHORING_SCOPES:undefined,META_AUTHORING_CREATE_SCOPES:undefined,
      },stdout:"pipe",stderr:"pipe",ipc(message){if(message&&typeof message==="object"&&"type"in message&&message.type==="ready")ready.resolve(message as Ready)}})
      running.add(child)
      const stderr=new Response(child.stderr).text()
      const stdout=new Response(child.stdout).text()
      const evidence=await deadline(Promise.race([ready.promise,child.exited.then(async code=>{throw Error(`Observed world exited ${code}: ${await stderr}\n${await stdout}`)})]),20_000,"Observed world birth timed out")
      return {child,evidence,async stop(){
        child.send("stop")
        await deadline(child.exited,8000,"Observed world cleanup timed out")
        expect(child.exitCode,await stderr).toBe(0)
        for(const entry of evidence.children)expect(()=>process.kill(entry.pid,0)).toThrow()
        running.delete(child)
      }}
    }
    const [left,right]=await Promise.all([start("mac-fixture","codespace-fixture"),start("codespace-fixture","mac-fixture")])
    for(const instance of [left,right]){
      expect(instance.evidence.children).toHaveLength(3)
      for(const child of instance.evidence.children)expect(child.context).toBe(child.domain==="energy"?"energy-only":null)
      const health=await (await fetch(`${instance.evidence.origin}/health`)).json()
      expect(health.networkObservation.domains.map((domain:{name:string})=>domain.name).sort()).toEqual(["boundary","dark","energy","matrix"])
      expect(health.networkObservation.links).toHaveLength(3)
    }
    const socket=new WebSocket(`${left.evidence.origin.replace("http:","ws:")}/sw`)
    viewers.add(socket)
    let latest:PeerNetworkObservation|undefined
    socket.addEventListener("message",event=>{const value=parsePeerNetworkObservation(JSON.parse(String(event.data)));if(value)latest=value})
    await deadline(new Promise<void>((resolve,reject)=>{socket.addEventListener("open",()=>resolve(),{once:true});socket.addEventListener("error",()=>reject(Error("Viewer failed")),{once:true})}),1000,"Viewer open timed out")
    const poll=async(check:()=>boolean)=>{
      const end=Date.now()+12_000
      while(!check()){if(Date.now()>end)throw Error(`Peer telemetry timed out: ${JSON.stringify(latest)}`);socket.send(JSON.stringify(peerObservationRequest()));await Bun.sleep(50)}
    }
    await poll(()=>latest?.localPeerId==="mac-fixture"&&latest.peers.length===2&&latest.peers.every(peer=>peer.status==="fresh"&&peer.report?.domains.length===4&&peer.report.domains.every(domain=>domain.state==="running")&&peer.report.links.every(link=>link.oracleReady&&link.forceReady)))
    expect(latest!.peers).toHaveLength(2)
    for(const peer of latest!.peers){
      expect(peer.report?.domains).toHaveLength(4)
      expect(peer.report?.domains.every(domain=>domain.state==="running")).toBeTrue()
      expect(peer.report?.links).toHaveLength(3)
      for(const link of peer.report!.links){
        expect(link.transport).toBe("direct")
        expect(link.oracle).toBe("open")
        expect(link.force).toBe("open")
        expect(link.oracleReady).toBeTrue()
        expect(link.forceReady).toBeTrue()
      }
    }
    expect(latest!.peers.find(peer=>peer.peerId==="codespace-fixture")?.transport).toBe("relay")
    const serialized=JSON.stringify(latest)
    expect(serialized).not.toContain(token)
    expect(serialized).not.toContain(directory)
    expect(serialized).not.toContain("energy-only")
    // An external observer cannot claim the native publisher capability.
    const rejected=await fetch(`${left.evidence.origin}/sw`,{headers:{"X-Cosmos-Observation":"publisher",Authorization:"Bearer outsider"}})
    expect(rejected.status).toBe(403)
    await right.stop()
    await poll(()=>latest?.peers.find(peer=>peer.peerId==="codespace-fixture")?.status==="disconnected")
    expect(latest!.peers.find(peer=>peer.peerId==="codespace-fixture")?.report).toBeNull()
    socket.close();viewers.delete(socket)
    await left.stop()
  } finally {
    for(const viewer of viewers)viewer.close()
    await Promise.all([...running].map(async child=>{
      if(child.exitCode!==null)return
      child.send("stop")
      await deadline(child.exited,8000,"Fixture forced cleanup").catch(()=>{child.kill("SIGKILL")})
      await child.exited
    }))
    await broker.close()
    await rm(directory,{recursive:true,force:true})
  }
},60_000)
