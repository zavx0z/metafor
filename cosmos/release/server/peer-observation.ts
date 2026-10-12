import type {PeerNetwork} from "@metafor/tech-peer"
import {PEER_OBSERVATION_CHANNEL, PEER_OBSERVATION_SCHEMA, PEER_OBSERVATION_TTL_MS,
  parseDomainTransportReport, type DomainTransportReport, type ObservedPeer, type PeerNetworkObservation} from "../shared/peer-observation"

/**
Явная локальная capability владельца Node. read возвращает только собственный
отчёт, publish получает производный снимок соседей. Отказ наблюдения не ломает
прикладной transport; close освобождает принадлежащие capability ресурсы.
[Владелец](../README.md#наблюдение-сетей-участников),
[проверка двух живых контуров](../spec/network-observation-native.spec.ts).
*/
export interface ReleaseNodeObservationSource {
  read(): Promise<DomainTransportReport | null>
  publish?(snapshot: PeerNetworkObservation): void
  close?(): void
}
/** Read-only обмен использует отдельный logical service существующей authenticated сети и не пересылает отчёты третьих пиров. */
export function observeReleasePeers(network: PeerNetwork, allowed: ReadonlySet<string>, source?: ReleaseNodeObservationSource) {
  const producerId = crypto.randomUUID()
  const remotes = new Map<string,{generation: string; report: DomainTransportReport | null; receivedAt: number | null}>()
  const pending = new Map<string,{id:string; generation:string; at:number}>()
  let local: DomainTransportReport | null = null
  let localAt: number | null = null
  let seq = 0
  let closed = false
  let refreshing: Promise<void> | undefined
  const stopped=Promise.withResolvers<null>()
  let localRead: Promise<DomainTransportReport | null> | undefined
  const read = () => localRead ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const value = await Promise.race([source?.read() ?? Promise.resolve(null), stopped.promise, new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1500)})])
      return parseDomainTransportReport(value)
    } catch {return null} finally {clearTimeout(timer)}
  })().finally(()=>{localRead=undefined})
  const snapshot = (): PeerNetworkObservation => {
    const now = Date.now()
    const peers: ObservedPeer[] = [{peerId:network.id,source:"local",status:closed?"disconnected":local&&localAt!==null&&now-localAt<PEER_OBSERVATION_TTL_MS?"fresh":"unknown",
      receivedAt:localAt,generation:null,transport:null,connectionState:closed?"disconnected":"open",report:!closed&&localAt!==null&&now-localAt<PEER_OBSERVATION_TTL_MS?local:null}]
    for (const [peerId, remote] of remotes) {
      const link=network.snapshot().links.find(link=>link.peerId===peerId&&link.generation===remote.generation)
      const connected=!closed&&link?.state==="open"
      const fresh=connected&&remote.report!==null&&remote.receivedAt!==null&&now-remote.receivedAt<PEER_OBSERVATION_TTL_MS
      peers.push({peerId,source:"peer",status:closed||!link?"disconnected":fresh?"fresh":remote.receivedAt===null?"unknown":"expired",
        receivedAt:remote.receivedAt,generation:link?.generation??null,transport:link?.transport??null,
        connectionState:closed||!link?"disconnected":link.state==="open"?"open":"connecting",report:fresh?remote.report:null})
    }
    return {schema:PEER_OBSERVATION_SCHEMA,producerId,seq,observedAt:now,localPeerId:network.id,peers}
  }
  const publish = () => {seq++;try{source?.publish?.(snapshot())}catch{}}
  const send = (peerId:string, value:unknown) => network.send(peerId,JSON.stringify(value),{channel:PEER_OBSERVATION_CHANNEL}).catch(()=>{})
  const refresh = () => refreshing ??= (async () => {
    if(closed)return
    local=await read();localAt=local?Date.now():null
    if(closed)return
    const now=Date.now()
    for(const link of network.snapshot().links) {
      if(!allowed.has(link.peerId))continue
      if(remotes.get(link.peerId)?.generation!==link.generation)remotes.set(link.peerId,{generation:link.generation,report:null,receivedAt:null})
      if(link.state!=="open"||!source)continue
      const previous=pending.get(link.peerId)
      if(previous&&now-previous.at<3000)continue
      const id=crypto.randomUUID()
      pending.set(link.peerId,{id,generation:link.generation,at:now})
      void send(link.peerId,{kind:"request",id})
    }
    publish()
  })().finally(()=>{refreshing=undefined})
  const replying=new Set<string>()
  const repliedAt=new Map<string,number>()
  const offData=network.onData(event=>{
    if(closed||event.channel!==PEER_OBSERVATION_CHANNEL||!allowed.has(event.peerId)||typeof event.data!=="string"||event.data.length>8192)return
    const link=network.snapshot().links.find(link=>link.peerId===event.peerId&&link.state==="open")
    if(!link)return
    let value:unknown
    try{value=JSON.parse(event.data)}catch{return}
    if(!value||typeof value!=="object")return
    const packet=value as {kind?:unknown;id?:unknown;report?:unknown}
    if(typeof packet.id!=="string"||!/^[a-f0-9-]{36}$/.test(packet.id))return
    if(packet.kind==="request") {
      if(Object.keys(packet).length!==2||replying.has(event.peerId)||Date.now()-(repliedAt.get(event.peerId)??0)<1000)return
      repliedAt.set(event.peerId,Date.now())
      replying.add(event.peerId)
      void read().then(report=>{if(!closed) return send(event.peerId,{kind:"response",id:packet.id,report})}).finally(()=>replying.delete(event.peerId))
    } else if(packet.kind==="response") {
      const expected=pending.get(event.peerId)
      if(Object.keys(packet).length!==3||!expected||expected.id!==packet.id||expected.generation!==link.generation)return
      pending.delete(event.peerId)
      const report=packet.report===null?null:parseDomainTransportReport(packet.report)
      if(packet.report!==null&&!report)return
      const previous=remotes.get(event.peerId)
      if(report&&previous?.report?.producerId===report.producerId&&previous.report.seq>report.seq)return
      remotes.set(event.peerId,{generation:link.generation,report,receivedAt:report?Date.now():null})
      publish()
    }
  })
  const offState=network.subscribe(()=>{
    for(const [peerId,remote]of remotes)if(!network.snapshot().links.some(link=>link.peerId===peerId&&link.generation===remote.generation&&link.state==="open")){
      remote.report=null;remote.receivedAt=null;pending.delete(peerId)
    }
    publish()
    void refresh()
  })
  const timer=setInterval(()=>void refresh(),3000)
  void refresh()
  return {snapshot,refresh,close(){if(closed)return;closed=true;stopped.resolve(null);clearInterval(timer);offData();offState();pending.clear();local=null;publish();try{source?.close?.()}catch{}}}
}
