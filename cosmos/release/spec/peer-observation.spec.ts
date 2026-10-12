import {expect,test} from "bun:test"
import {mkdtemp,writeFile,rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {startReleaseNode} from "@cosmos/release/node"
import {DOMAIN_OBSERVATION_SCHEMA,parseDomainTransportReport,parsePeerNetworkObservation,type DomainTransportReport} from "../shared/peer-observation"

const domainReport=(producerId:string):DomainTransportReport=>({schema:DOMAIN_OBSERVATION_SCHEMA,producerId,seq:1,observedAt:Date.now(),domains:[{name:"dark",state:"running"},{name:"energy",state:"running"}],links:[{to:"energy",generation:"fixture-generation",state:"open",transport:"direct",oracle:"open",force:"open",oracleReady:true,forceReady:true}]})
async function until(check:()=>boolean){const end=Date.now()+6000;while(!check()){if(Date.now()>end)throw Error("Observation did not arrive");await Bun.sleep(10)}}

test("strict local-only report cannot import another peer, nested topology or secrets",()=>{
  const value=domainReport("source")
  expect(parseDomainTransportReport(value)).toEqual(value)
  for(const extra of [{peerId:"victim"},{token:"private"},{peers:[]},{path:"/private/config"}])expect(parseDomainTransportReport({...value,...extra})).toBeNull()
  expect(parseDomainTransportReport({...value,links:[value.links[0],value.links[0]]})).toBeNull()
})

test("authenticated exchange binds actual peer identity, ignores roster-only internals and clears disconnected reports",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"peer-observation-"))
  const token="test-only-observation-room-token"
  const tokenFile=join(directory,"token")
  await writeFile(tokenFile,token,{mode:0o600})
  const broker=createRendezvousServer({token,relay:true})
  const source={async readGraph():Promise<never>{throw Error("Unused")},async read():Promise<never>{throw Error("Unused")}}
  const noRtc=()=>{throw Error("Fixture relay")}
  const a=await startReleaseNode({config:{id:"a",tokenFile,signalingUrl:broker.url,allowedPeers:["b"],iceServers:[]},source,observation:{async read(){return domainReport("local-a")}}},{rtc:noRtc})
  const b=await startReleaseNode({config:{id:"b",tokenFile,signalingUrl:broker.url,allowedPeers:["a"],iceServers:[]},source,observation:{async read(){return domainReport("claim-is-not-peer-identity")}}},{rtc:noRtc})
  try{
    await a.peer("b")
    await a.refreshObservation();await b.refreshObservation()
    await until(()=>a.observe().peers.some(peer=>peer.peerId==="b"&&peer.report!==null))
    const observed=a.observe()
    expect(parsePeerNetworkObservation(observed)).not.toBeNull()
    expect(observed.peers.find(peer=>peer.peerId==="b")?.source).toBe("peer")
    expect(observed.peers.some(peer=>peer.peerId==="claim-is-not-peer-identity")).toBeFalse()
    expect(JSON.stringify(observed)).not.toContain(token)
    expect(JSON.stringify(observed)).not.toContain(tokenFile)
    await b.close()
    await until(()=>a.observe().peers.find(peer=>peer.peerId==="b")?.status==="disconnected")
    expect(a.observe().peers.find(peer=>peer.peerId==="b")?.report).toBeNull()
  }finally{await a.close();await b.close();await broker.close();await rm(directory,{recursive:true,force:true})}
})

test("an unavailable local observer cannot hold the participant close or expose a fabricated report",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"peer-observation-cancel-"))
  const token="test-only-observation-cancel-token"
  const tokenFile=join(directory,"token")
  await writeFile(tokenFile,token,{mode:0o600})
  const broker=createRendezvousServer({token,relay:true})
  let closed=0
  const node=await startReleaseNode({config:{id:"observer",tokenFile,signalingUrl:broker.url,allowedPeers:[],iceServers:[]},
    source:{async readGraph():Promise<never>{throw Error("Unused")},async read():Promise<never>{throw Error("Unused")}},
    observation:{read:()=>new Promise(()=>{}),close(){closed++}}})
  try {
    expect(node.observe().peers[0]?.report).toBeNull()
    const refresh=node.refreshObservation()
    let timer:ReturnType<typeof setTimeout>|undefined
    try {await Promise.race([node.close(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Observer held participant cleanup")),500)})])}
    finally{clearTimeout(timer)}
    await refresh
    expect(closed).toBe(1)
  }finally{await node.close();await broker.close();await rm(directory,{recursive:true,force:true})}
})
