import {parseDomainTransportReport, type PeerNetworkObservation} from "../shared/peer-observation"
import type {ReleaseNodeObservationSource} from "./peer-observation"

/**
Native caller явно передаёт приватный context текущей incarnation. Адаптер читает
санитизированный отчёт существующего loopback /health и публикует снимок через
тот же /sw с native header capability. read ограничен размером и временем,
close отменяет fetch, reconnect timer и принадлежащий ему socket.
Приватные headers не входят в DTO. При отсутствии context bridge не создаётся;
не-loopback origin отвергается. [Владелец](../README.md#наблюдение-сетей-участников),
[проверка](../spec/network-observation-native.spec.ts).
*/
export function createReleaseNodeObservationBridge(input: {origin?: string; token?: string}): ReleaseNodeObservationSource | undefined {
  if (!input.origin || !input.token) return
  const origin=new URL(input.origin)
  if(origin.protocol!=="http:"||!["127.0.0.1","localhost","[::1]"].includes(origin.hostname)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")throw new Error("Observation requires its local release origin")
  const address=new URL("/sw",origin);address.protocol="ws:"
  const abort=new AbortController()
  let closed=false
  let socket:WebSocket|undefined
  let latest:string|undefined
  let timer:ReturnType<typeof setTimeout>|undefined
  const flush=()=>{
    if(closed||socket?.readyState!==WebSocket.OPEN||!latest||socket.bufferedAmount>=128*1024)return
    try{socket.send(latest);latest=undefined}catch{socket.close()}
  }
  const connect=()=>{
    if(closed||socket&&socket.readyState<WebSocket.CLOSING)return
    const NativeSocket=WebSocket as unknown as {new(url:string,options:Bun.WebSocketOptions):WebSocket}
    const current=new NativeSocket(address.href,{headers:{Authorization:`Bearer ${input.token}`,"X-Cosmos-Observation":"publisher"}})
    socket=current
    current.addEventListener("open",flush)
    current.addEventListener("close",()=>{if(socket===current)socket=undefined;if(!closed){clearTimeout(timer);timer=setTimeout(connect,1000)}})
    current.addEventListener("error",()=>{})
  }
  return {
    async read(){
      if(closed)return null
      const timeout=new AbortController()
      const timer=setTimeout(()=>timeout.abort(),1200)
      try{
        const response=await fetch(new URL("/health",origin),{signal:AbortSignal.any([abort.signal,timeout.signal]),redirect:"error"})
        return parseDomainTransportReport((await boundedJson(response)).networkObservation)
      }catch{return null}finally{clearTimeout(timer)}
    },
    publish(snapshot:PeerNetworkObservation){
      if(closed)return
      const body=JSON.stringify(snapshot)
      if(new TextEncoder().encode(body).length>128*1024)return
      latest=body
      connect();flush()
    },
    close(){closed=true;clearTimeout(timer);abort.abort();latest=undefined;socket?.close();socket=undefined},
  }
}

async function boundedJson(response:Response):Promise<Record<string,unknown>> {
  const reader=response.body?.getReader()
  if(!reader)throw new Error("Observation body unavailable")
  const chunks:Uint8Array[]=[]
  let bytes=0
  try {
    for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>64*1024)throw new Error("Observation body limit");chunks.push(next.value)}
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
}
