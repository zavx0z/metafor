import {expect,test} from "bun:test"
import {createNetworkObservationSurface} from "../server/network-observation"
import {PEER_OBSERVATION_SCHEMA,DOMAIN_OBSERVATION_SCHEMA,peerObservationRequest,parsePeerNetworkObservation,type PeerNetworkObservation} from "../shared/peer-observation"
import type {RpcSocketData} from "../server/rpc"

const server={requestIP(){return {address:"127.0.0.1",family:"IPv4",port:1}}} as Pick<Bun.Server<unknown>,"requestIP">
function socket(data:RpcSocketData){
  const sent:string[]=[]
  const closed:number[]=[]
  return {sent,closed,socket:{data,send(value:string){sent.push(value)},close(code:number){closed.push(code)}} as unknown as Bun.ServerWebSocket<RpcSocketData>}
}
function snapshot(producerId:string,localPeerId:string):PeerNetworkObservation{return {schema:PEER_OBSERVATION_SCHEMA,producerId,seq:1,observedAt:1,localPeerId,
  peers:[{peerId:localPeerId,source:"local",status:"unknown",receivedAt:null,generation:null,transport:null,connectionState:"open",report:null}]}}

test("native observation publisher requires existing private capability and loopback authority; viewer never receives a secret",()=>{
  const surface=createNetworkObservationSurface({authorizePublisher:request=>request.headers.get("authorization")==="Bearer private-fixture"})
  const request=(headers:Record<string,string>={})=>new Request("http://127.0.0.1/sw",{headers})
  expect((surface.data(request({"X-Cosmos-Observation":"publisher"}),server) as Response).status).toBe(403)
  expect((surface.data(request({"X-Cosmos-Observation":"publisher",authorization:"Bearer private-fixture",forwarded:"host=external"}),server) as Response).status).toBe(403)
  const publisher=socket(surface.data(request({"X-Cosmos-Observation":"publisher",authorization:"Bearer private-fixture"}),server) as RpcSocketData)
  surface.message(publisher.socket,snapshot("source","mac"))
  const remote=socket(surface.data(new Request("http://remote.test/sw"),server) as RpcSocketData)
  expect(surface.message(remote.socket,peerObservationRequest())).toBeTrue()
  expect(remote.sent).toHaveLength(0)
  const viewer=socket(surface.data(request(),server) as RpcSocketData)
  surface.message(viewer.socket,peerObservationRequest())
  expect(parsePeerNetworkObservation(JSON.parse(viewer.sent[0]!))?.localPeerId).toBe("mac")
  expect(viewer.sent[0]).not.toContain("private-fixture")
  surface.message(publisher.socket,snapshot("source","impersonated"))
  expect(publisher.closed).toEqual([1008])
  surface.close(publisher.socket)
  viewer.sent.length=0
  surface.message(viewer.socket,peerObservationRequest())
  expect(parsePeerNetworkObservation(JSON.parse(viewer.sent[0]!))?.peers[0]?.report).toBeNull()
  surface.destroy()
})

test("concurrent admitted sockets cannot grow telemetry cache beyond its bounded producers",()=>{
  const surface=createNetworkObservationSurface({authorizePublisher:()=>true})
  const request=new Request("http://127.0.0.1/sw",{headers:{"X-Cosmos-Observation":"publisher"}})
  const admitted=Array.from({length:9},()=>socket(surface.data(request,server) as RpcSocketData))
  for(const [index,current]of admitted.entries())surface.message(current.socket,snapshot(`source-${index}`,`peer-${index}`))
  expect(admitted[8]!.closed).toEqual([1008])
  const viewer=socket({source:"release/service",observation:"viewer"})
  surface.message(viewer.socket,peerObservationRequest())
  expect(viewer.sent).toHaveLength(8)
  expect(surface.data(request,server)).toBeInstanceOf(Response)
  surface.destroy()
})

test("repeated local reads do not extend the source report freshness",()=>{
  const surface=createNetworkObservationSurface({})
  const value=snapshot("source","mac")
  value.observedAt=10_001
  value.peers[0]!.status="fresh"
  value.peers[0]!.receivedAt=1
  value.peers[0]!.report={schema:DOMAIN_OBSERVATION_SCHEMA,producerId:"incarnation",seq:1,observedAt:1,domains:[{name:"dark",state:"running"}],links:[]}
  surface.publish(value)
  const viewer=socket({source:"release/service",observation:"viewer"})
  surface.message(viewer.socket,peerObservationRequest())
  const result=parsePeerNetworkObservation(JSON.parse(viewer.sent[0]!))!
  expect(result.peers[0]!.status).toBe("expired")
  expect(result.peers[0]!.report).toBeNull()
  surface.destroy()
})
