import {isLoopbackAddress} from "shared/transport/oracle"
import {PEER_OBSERVATION_SCHEMA, isPeerObservationRequest, parsePeerNetworkObservation, PEER_OBSERVATION_TTL_MS, type DomainTransportReport, type PeerNetworkObservation} from "../shared/peer-observation"
import type {RpcSocketData} from "./rpc"

/** Локальный ограниченный кэш telemetry; не каноническое состояние и не authority знакомства пиров. */
export function createNetworkObservationSurface(options:{local?:()=>DomainTransportReport|null;authorizePublisher?:(request:Request,server:Pick<Bun.Server<unknown>,"requestIP">)=>boolean}) {
  const id=crypto.randomUUID()
  const reports=new Map<Bun.ServerWebSocket<RpcSocketData>,{snapshot:PeerNetworkObservation;at:number}>()
  let seq=0
  let localPeer: {snapshot:PeerNetworkObservation;at:number}|undefined
  const localRequest=(request:Request,server:Pick<Bun.Server<unknown>,"requestIP">)=>isLoopbackAddress(server.requestIP(request)?.address)&&["127.0.0.1","localhost","[::1]"].includes(new URL(request.url).hostname)&&!request.headers.has("forwarded")&&!request.headers.has("x-forwarded-host")
  return {
    publish(snapshot:PeerNetworkObservation){const value=parsePeerNetworkObservation(snapshot);if(value)localPeer={snapshot:value,at:Date.now()}},
    data(request:Request,server:Pick<Bun.Server<unknown>,"requestIP">):RpcSocketData|Response {
      if(request.headers.get("X-Cosmos-Observation")==="publisher") {
        if(!localRequest(request,server)||!options.authorizePublisher?.(request,server)||reports.size>=8)return new Response(null,{status:403})
        return {source:"release/service",observation:"publisher"}
      }
      return {source:"release/service",...(localRequest(request,server)?{observation:"viewer" as const}:{})}
    },
    /** Перехватывает только наблюдения; существующий протокол release cache остаётся у своего владельца. */
    message(socket:Bun.ServerWebSocket<RpcSocketData>,value:unknown):boolean {
      if(socket.data.observation==="publisher") {
        const snapshot=parsePeerNetworkObservation(value)
        const previous=reports.get(socket)
        if(!previous&&reports.size>=8){socket.close(1008,"Observation limit");return true}
        if(!snapshot||snapshot.localPeerId===null||previous&&(previous.snapshot.producerId!==snapshot.producerId||previous.snapshot.localPeerId!==snapshot.localPeerId)||previous&&previous.snapshot.seq>snapshot.seq){socket.close(1008,"Invalid observation");return true}
        reports.set(socket,{snapshot,at:Date.now()});return true
      }
      if(!isPeerObservationRequest(value))return false
      if(socket.data.observation!=="viewer")return true
      const now=Date.now()
      const fresh=[...reports.values(),...(localPeer?[localPeer]:[])].filter(report=>now-report.at<PEER_OBSERVATION_TTL_MS).sort((a,b)=>b.at-a.at)
      if(fresh.length)for(const report of fresh){
        const snapshot=structuredClone(report.snapshot)
        for(const peer of snapshot.peers)if(peer.status==="fresh"&&peer.receivedAt!==null&&snapshot.observedAt-peer.receivedAt+now-report.at>=PEER_OBSERVATION_TTL_MS){peer.status="expired";peer.report=null}
        socket.send(JSON.stringify(snapshot))
      }
      else {
        const report=options.local?.()??null
        const snapshot:PeerNetworkObservation={schema:PEER_OBSERVATION_SCHEMA,producerId:id,seq:++seq,observedAt:now,localPeerId:null,
          peers:[{peerId:null,source:"local",status:report?"fresh":"unknown",receivedAt:report?now:null,generation:null,transport:null,connectionState:"open",report}]}
        socket.send(JSON.stringify(snapshot))
      }
      return true
    },
    close(socket:Bun.ServerWebSocket<RpcSocketData>){reports.delete(socket)},
    destroy(){for(const socket of reports.keys())socket.close(1012,"Observation stopped");reports.clear()},
  }
}
