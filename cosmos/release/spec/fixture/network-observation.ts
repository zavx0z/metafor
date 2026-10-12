import {join} from "node:path"
import {prepareQuantumRuntime, runQuantumDomain, type QuantumRuntimeSocketData} from "../../server/quantum"
import {startReleaseNode, createReleaseNodeObservationBridge} from "@cosmos/release/node"
import {createNetworkObservationSurface} from "../../server/network-observation"
import type {RpcSocketData} from "../../server/rpc"

const domain = Bun.env.COSMOS_QUANTUM_DOMAIN
if (domain) {
  await runQuantumDomain(domain)
  await Bun.write(join(process.cwd(), `observed-${domain}.json`), JSON.stringify({domain, pid:process.pid,
    context:Bun.env.OBSERVATION_ENERGY_CONTEXT ?? null}))
  if (domain === "energy") {
    const config=JSON.parse(Bun.env.OBSERVATION_PEER_CONFIGURATION!)
    const observation=createReleaseNodeObservationBridge({origin:Bun.env.FORCE_RPC_ADDRESS!,token:Bun.env.COSMOS_QUANTUM_TOKEN!})!
    const node=await startReleaseNode({config,observation,source:{async readGraph():Promise<never>{throw Error("Unused")},async read():Promise<never>{throw Error("Unused")}}},
      {rtc(){throw Error("External fixture relay")}})
    process.once("SIGTERM",()=>void node.close())
    process.once("SIGINT",()=>void node.close())
  }
} else {
  const stateRoot=Bun.env.OBSERVATION_STATE_ROOT!
  const quantum=await prepareQuantumRuntime({stateRoot,executable:process.argv[1]!,transport:"peer",readyTimeoutMs:15_000,
    energyEnvironment:{OBSERVATION_ENERGY_CONTEXT:"energy-only"}})
  const observations=createNetworkObservationSurface({local:()=>quantum.observeDomains(),authorizePublisher:quantum.authorizeObservation})
  type SocketData=QuantumRuntimeSocketData|RpcSocketData
  const server=Bun.serve<SocketData>({port:0,hostname:"127.0.0.1",
    async fetch(request,current){
      if(new URL(request.url).pathname!=="/sw")return quantum.fetch(request,current)
      const data=observations.data(request,current)
      if(data instanceof Response)return data
      return current.upgrade(request,{data})?undefined:new Response(null,{status:426})
    },websocket:{
      open(socket){if(quantum.owns(socket.data))quantum.websocket.open(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>)},
      message(socket,message){
        if(quantum.owns(socket.data))return quantum.websocket.message(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>,message)
        if(message.length>128*1024){socket.close(1009);return}
        try{observations.message(socket as Bun.ServerWebSocket<RpcSocketData>,JSON.parse(String(message)))}catch{socket.close(1008)}
      },
      close(socket,code,reason){
        if(quantum.owns(socket.data))quantum.websocket.close(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>,code,reason)
        else observations.close(socket as Bun.ServerWebSocket<RpcSocketData>)
      },
    },
  })
  let stopping:Promise<void>|undefined
  const close=()=>stopping??=(async()=>{
    await quantum.close()
    observations.destroy()
    await server.stop(true)
    process.disconnect?.()
  })()
  process.on("message",message=>{if(message==="stop")void close().catch(error=>{console.error(error);process.exitCode=1})})
  void quantum.failure.catch(async error=>{console.error(error);await close();process.exitCode=1})
  try {
    await quantum.start(server.port!)
    const children=await Promise.all(["boundary","matrix","energy"].map(async name=>{
      const file=Bun.file(join(stateRoot,`observed-${name}.json`))
      const deadline=Date.now()+3000
      while(!await file.exists()){if(Date.now()>deadline)throw Error(`Missing ${name} evidence`);await Bun.sleep(10)}
      return file.json()
    }))
    process.send?.({type:"ready",origin:server.url.origin,children})
  } catch(error){console.error(error);await close();process.exitCode=1}
}
