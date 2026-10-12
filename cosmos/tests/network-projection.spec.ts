import {expect, test} from "bun:test"
import {createNetworkProjection} from "../release/main/network"
import {NETWORK_OBSERVATION_SCHEMA, type NetworkSnapshot} from "../release/shared/observation"
import {DOMAIN_OBSERVATION_SCHEMA,PEER_OBSERVATION_SCHEMA,type DomainTransportReport,type PeerNetworkObservation} from "../release/shared/peer-observation"

function peerSnapshot():PeerNetworkObservation {
  const report:DomainTransportReport={schema:DOMAIN_OBSERVATION_SCHEMA,producerId:"domain-incarnation",seq:1,observedAt:1,
    domains:[{name:"dark" as const,state:"running" as const},{name:"energy" as const,state:"running" as const}],
    links:[{to:"energy" as const,generation:"domain-generation",state:"open" as const,transport:"direct" as const,oracle:"open" as const,force:"open" as const,oracleReady:true,forceReady:false}]}
  return {schema:PEER_OBSERVATION_SCHEMA,producerId:"observer",seq:1,observedAt:1,localPeerId:"mac",peers:[
    {peerId:"mac",source:"local",status:"fresh",receivedAt:1,generation:null,transport:null,connectionState:"open",report},
    {peerId:"codespace",source:"peer",status:"fresh",receivedAt:1,generation:"external-generation",transport:"relay",connectionState:"open",report:{...report,producerId:"remote-incarnation"}},
  ]}
}

test("device peers use reported domains only; native open does not imply hydrated Force, stale or disconnected reports disappear",()=>{
  const graph=createNetworkProjection("window")
  const value=peerSnapshot()
  expect(graph.accept(value,0)).toBeTrue()
  const current=graph.view(0,null)
  expect(current.frames.filter(frame=>["mac","codespace"].includes(frame.label))).toHaveLength(2)
  expect(current.nodes.filter(node=>["dark","energy"].includes(node.label))).toHaveLength(4)
  expect(current.connections.filter(edge=>edge.label==="Oracle").every(edge=>edge.state==="open")).toBeTrue()
  expect(current.connections.filter(edge=>edge.label==="Force").every(edge=>edge.state==="unknown")).toBeTrue()
  expect(graph.view(10_001,null).nodes.some(node=>node.label==="dark")).toBeFalse()
  value.seq++
  value.peers[1]!.status="disconnected";value.peers[1]!.connectionState="disconnected";value.peers[1]!.report=null
  graph.accept(value,10_002)
  const disconnected=graph.view(10_002,null)
  expect(disconnected.nodes.filter(node=>node.label==="dark")).toHaveLength(1)
  expect(disconnected.connections.some(edge=>edge.label==="Peer")).toBeFalse()
  expect(graph.accept({...value,seq:0},10_003)).toBeFalse()
})

function snapshot(producerId: string, seq = 1): NetworkSnapshot {
  return {
    schema: NETWORK_OBSERVATION_SCHEMA,
    kind: "snapshot",
    producerId,
    seq,
    releaseVersion: "0.1.29",
    state: "running",
    connections: [{id: `${producerId}:socket`, endpoint: "ws://localhost/sw", state: "open", sentBytes: 15, receivedBytes: 23}],
    transfers: [],
    counts: {cacheHits: 2, networkRequests: 0},
    historyDropped: 0,
  }
}

test("одинаковый URL не объединяет соединения двух service incarnations", () => {
  const graph = createNetworkProjection("window")
  graph.accept(snapshot("previous"), 0)
  graph.accept(snapshot("candidate"), 1)
  const view = graph.view(1, "/@cosmos/startup")
  expect(view.nodes.filter(node => node.label.startsWith("WebSocket"))).toHaveLength(2)
  expect(view.connections.filter(edge => edge.label.startsWith("WebSocket"))).toHaveLength(2)
  expect(view.nodes.some(node => node.label.includes("RTC"))).toBe(false)
  expect(view.nodes.find(node => node.id === "runtime:previous")?.details).toContain("Запросы сети: 0")
})

test("молчание означает неизвестное состояние, а не доказанное закрытие", () => {
  const graph = createNetworkProjection("window")
  graph.accept(snapshot("service"), 0)
  const view = graph.view(10_001, "/@cosmos/startup")
  expect(view.connections.find(edge => edge.id === "service:socket")?.state).toBe("unknown")
  expect(view.nodes.find(node => node.id === "runtime:service")?.details).toContain("сведения устарели")
  graph.accept(snapshot("service"), 10_002)
  expect(graph.view(10_002, "/@cosmos/startup").connections.find(edge => edge.id === "service:socket")?.state).toBe("open")
})

test("завершение runtime не выдаётся за закрытие WS; старый seq не отменяет факт", () => {
  const graph = createNetworkProjection("window")
  const ended = snapshot("service", 2)
  ended.state = "destroyed"
  ended.connections[0]!.state = "closing"
  graph.accept(ended, 10)
  expect(graph.accept(snapshot("service", 1), 20)).toBe(false)
  const view = graph.view(20, "/@cosmos/startup")
  expect(view.connections.find(edge => edge.id === "service:socket")?.state).toBe("closing")
  expect(view.nodes.find(node => node.id === "runtime:service")?.details).toContain("destroyed")
  ended.seq = 3
  ended.connections[0]!.state = "closed"
  graph.accept(ended, 30)
  expect(graph.view(30, "/@cosmos/startup").connections.some(edge => edge.id === "service:socket")).toBe(false)
})

test("BroadcastChannel не приписывает все release текущему controller", () => {
  const graph = createNetworkProjection("window")
  graph.accept(snapshot("controlling"), 0, true)
  graph.accept(snapshot("installing"), 1)
  const view = graph.view(2, "/@cosmos/startup")
  expect(view.connections.some(edge => edge.to === "runtime:controlling")).toBe(true)
  expect(view.connections.some(edge => edge.to === "runtime:installing")).toBe(false)
  graph.controllerChanged()
  expect(graph.view(3, "/@cosmos/startup").connections.some(edge => edge.to === "runtime:controlling")).toBe(false)
})

test("вкладка без controller не изображает действующее управление worker", () => {
  const graph = createNetworkProjection("window")
  const view = graph.view(0, null)
  expect(view.nodes).toHaveLength(1)
  expect(view.connections).toHaveLength(0)
  expect(graph.accept({schema: NETWORK_OBSERVATION_SCHEMA, kind: "snapshot"}, 0)).toBe(false)
})
