import {expect, test} from "bun:test"
import {createReleaseObservation} from "../release/service/observation"
import {createReleaseCache} from "../release/service/fetch"
import {startRpc} from "../release/service/rpc"
import {updateRelease} from "../release/service/update"
import {
  NETWORK_OBSERVATION_SCHEMA,
  parseNetworkSnapshot,
} from "../release/shared/observation"
import {PEER_OBSERVATION_SCHEMA,peerObservationRequest,type PeerNetworkObservation} from "../release/shared/peer-observation"

test.serial("service cache cannot refresh expired native evidence by answering repeated viewer requests",()=>{
  let now=0
  const restore=replaceGlobals({performance:{now:()=>now}})
  const observer=createReleaseObservation(null)
  const value:PeerNetworkObservation={schema:PEER_OBSERVATION_SCHEMA,producerId:"native",seq:2,observedAt:1,localPeerId:"mac",peers:[
    {peerId:"mac",source:"local",status:"unknown",receivedAt:null,generation:null,transport:null,connectionState:"open",report:null},
  ]}
  const answers:unknown[]=[]
  const request=()=>observer.message({data:peerObservationRequest(),ports:[{postMessage(value:unknown){answers.push(value)}}]} as unknown as ExtendableMessageEvent)
  try {
    observer.peers(value)
    now=9999;request()
    expect(answers).toEqual([value])
    observer.peers({...value,seq:1})
    now=10_000;request()
    expect(answers).toHaveLength(1)
    observer.peers({...value,seq:3})
    request()
    expect(answers).toHaveLength(2)
  }finally{observer.destroy();restore()}
})

test.serial("late snapshot, overlap, bounded history and coalesced fanout retain truthful sources", async () => {
  const restore = replaceGlobals({BroadcastChannel: FixtureChannel})
  FixtureChannel.instances = []
  try {
    const first = createReleaseObservation("1.0.0")
    const second = createReleaseObservation("1.1.0")
    expect(FixtureChannel.instances).toHaveLength(0)
    first.start()
    second.start()
    first.state("running")
    for (let index = 0; index < 150; index += 1)
      first.cacheHit("https://user:password@service.test/code?token=secret#fragment", 200)
    await settle()
    expect(FixtureChannel.instances.map(channel => channel.sent.length)).toEqual([1, 1])
    const snapshot = first.snapshot()
    expect(snapshot.producerId).not.toBe(second.snapshot().producerId)
    expect(snapshot.releaseVersion).toBe("1.0.0")
    expect(snapshot.transfers).toHaveLength(128)
    expect(snapshot.historyDropped).toBe(22)
    expect(snapshot.counts).toEqual({cacheHits: 150, networkRequests: 0})
    expect(snapshot.transfers.every(transfer => transfer.endpoint === "https://service.test/code")).toBeTrue()
    expect(parseNetworkSnapshot(snapshot)).toEqual(snapshot)
    expect(parseNetworkSnapshot({...snapshot, seq: -1})).toBeNull()
    expect(parseNetworkSnapshot({...snapshot, transfers: [{...snapshot.transfers[0], endpoint: "https://service.test/?token=secret"}]})).toBeNull()

    const answers: unknown[] = []
    first.message({data: {schema: NETWORK_OBSERVATION_SCHEMA, kind: "snapshot-request"},
      ports: [{postMessage(value: unknown) { answers.push(value) }}]} as unknown as ExtendableMessageEvent)
    expect(answers).toEqual([snapshot])
    const channel = FixtureChannel.instances[0]!
    channel.request()
    channel.request()
    await settle()
    expect(channel.sent).toHaveLength(2)
    expect(parseNetworkSnapshot(channel.sent.at(-1))?.producerId).toBe(snapshot.producerId)
    first.destroy()
    second.destroy()
    expect(first.snapshot().state).toBe("destroyed")
    expect(channel.closed).toBeTrue()
  } finally { restore() }
})

test.serial("observer transport failures do not escape into release operations", () => {
  const restore = replaceGlobals({BroadcastChannel: class { constructor() { throw new Error("unavailable") } }})
  try {
    const observer = createReleaseObservation(null)
    expect(() => {
      observer.start()
      observer.state("running")
      observer.cacheHit("not an absolute endpoint", 200)
      observer.message({data: {schema: NETWORK_OBSERVATION_SCHEMA, kind: "snapshot-request"},
        ports: [{postMessage() { throw new Error("closed port") }}]} as unknown as ExtendableMessageEvent)
      observer.destroy()
    }).not.toThrow()
  } finally { restore() }
})

test.serial("throwing supplied observers preserve cache hits and real fetch outcomes", async () => {
  const response = new Response("network")
  let calls = 0
  const restore = replaceGlobals({
    location: new URL("https://cache.test/"),
    caches: {open: async () => ({match: async () => undefined})},
    fetch: async () => { calls += 1; return response },
  })
  const fail = () => { throw new Error("observer failed") }
  try {
    const cache = createReleaseCache({
      read: async () => new Response("cache"), cache: async () => {}, verify: value => value, run: () => {},
    }, {network: fail, response: fail, cacheHit: fail})
    expect(await (await cache.cacheFirst(new Request("https://cache.test/present"))).text()).toBe("cache")
    expect(await cache.cacheFirst(new Request("https://remote.test/resource"))).toBe(response)
    expect(calls).toBe(1)
    const responseFailure = createReleaseCache({
      read: async () => undefined, cache: async () => {}, verify: value => value, run: () => {},
    }, {network: () => "operation", response: fail, cacheHit: fail})
    expect(await responseFailure.cacheFirst(new Request("https://remote.test/resource"))).toBe(response)
    expect(calls).toBe(2)
  } finally { restore() }
})

test.serial("throwing supplied WS observers preserve control send and close", async () => {
  FixtureSocket.instances = []
  const restore = replaceGlobals({location: new URL("https://rpc.test/"), WebSocket: FixtureSocket})
  const fail = () => { throw new Error("observer failed") }
  try {
    const rpc = startRpc({observation: {connection: fail, text: fail}, currentPackages: async () => [], applyDelta: async () => []})
    const socket = FixtureSocket.instances[0]!
    socket.readyState = FixtureSocket.OPEN
    socket.dispatchEvent(new Event("open"))
    await settle()
    expect(socket.sent).toEqual([JSON.stringify({type: "release-current", current: []})])
    socket.dispatchEvent(new MessageEvent("message", {data: JSON.stringify({type: "release-delta", update: [], remove: []})}))
    await settle()
    await rpc.destroy()
    expect(socket.readyState).toBe(FixtureSocket.CLOSING)
  } finally { restore() }
})

test.serial("cache hit and network response are distinct, and response body stays unread", async () => {
  const response = new Response("network body", {status: 201})
  let requests = 0
  const restore = replaceGlobals({
    location: new URL("https://cache.test/"),
    caches: {open: async () => ({match: async () => new Response("cached")})},
    fetch: async () => { requests += 1; return response },
  })
  try {
    const observer = createReleaseObservation("1.0.0")
    const cache = createReleaseCache({
      read: async () => new Response("cached"),
      cache: async () => {},
      verify: value => value,
      run: () => {},
    }, observer)
    expect(await (await cache.cacheFirst(new Request("https://cache.test/present"))).text()).toBe("cached")
    expect(requests).toBe(0)
    expect(await cache.cacheFirst(new Request("https://elsewhere.test/resource?secret=value"))).toBe(response)
    expect(response.bodyUsed).toBeFalse()
    expect(observer.snapshot().counts).toEqual({cacheHits: 1, networkRequests: 1})
    expect(observer.snapshot().transfers.map(({kind, phase, status}) => ({kind, phase, status}))).toEqual([
      {kind: "cache", phase: "hit", status: 200},
      {kind: "network", phase: "requested", status: undefined},
      {kind: "network", phase: "response", status: 201},
    ])
    expect(observer.snapshot().transfers.some(transfer => transfer.bytes !== undefined)).toBeFalse()
  } finally { restore() }
})

test.serial("WS metrics measure actual text sends and receives; close requested remains closing", async () => {
  FixtureSocket.instances = []
  const restore = replaceGlobals({location: new URL("https://rpc.test/"), WebSocket: FixtureSocket})
  try {
    const observer = createReleaseObservation("1.0.0")
    const rpc = startRpc({observation: observer, currentPackages: async () => [], applyDelta: async () => []})
    const socket = FixtureSocket.instances[0]!
    expect(observer.snapshot().connections[0]?.state).toBe("connecting")
    socket.readyState = FixtureSocket.OPEN
    socket.dispatchEvent(new Event("open"))
    await settle()
    const message = new MessageEvent("message", {data: "я"})
    socket.dispatchEvent(message)
    const before = observer.snapshot()
    expect(before.connections[0]?.state).toBe("open")
    expect(before.connections[0]?.sentBytes).toBe(socket.sent.reduce((sum,text)=>sum+new TextEncoder().encode(text).byteLength,0))
    expect(before.connections[0]?.receivedBytes).toBe(2)
    await rpc.destroy()
    expect(socket.readyState).toBe(FixtureSocket.CLOSING)
    expect(observer.snapshot().connections[0]?.state).toBe("closing")
    observer.destroy()
    expect(observer.snapshot().connections[0]?.state).toBe("closing")
    socket.readyState = FixtureSocket.CLOSED
    const closed = new Event("close")
    Object.assign(closed, {code: 1000, reason: "done", wasClean: true})
    socket.dispatchEvent(closed)
    expect(observer.snapshot().connections[0]?.state).toBe("closed")
  } finally { restore() }
})

test.serial("update exact fetch records response or failure without claiming verification or bytes", async () => {
  for (const failure of [false, true]) {
    const storage = new Map<string, Map<string, Response>>()
    const restore = replaceGlobals({
      location: new URL("https://update.test/"),
      caches: {
        keys: async () => [...storage.keys()],
        delete: async (name: string) => storage.delete(name),
        open: async (name: string) => {
          if (!storage.has(name)) storage.set(name, new Map())
          const entries = storage.get(name)!
          return {
            keys: async () => [...entries.keys()].map(url => new Request(url)),
            match: async (request: Request) => entries.get(request.url)?.clone(),
            put: async (request: Request, response: Response) => { entries.set(request.url, response.clone()) },
          }
        },
      },
      fetch: async () => {
        if (failure) throw new Error("offline")
        return new Response(null, {status: 503})
      },
    })
    try {
      const observer = createReleaseObservation("1.0.0")
      await expect(updateRelease({
        verify: response => { if (!response.ok) throw new Error("unavailable"); return response },
        read: async () => undefined,
        cache: async () => {},
        run: () => {},
      }, {update: [{name: "@internal/visual", env: "main", version: "1.0.1", sha256: "a".repeat(64), size: 1}], remove: []}, {
        observation: observer,
        prepare: async () => { throw new Error("no handover before verification") },
        activate: async () => {},
      })).rejects.toThrow(failure ? "offline" : "unavailable")
      const snapshot = observer.snapshot()
      expect(snapshot.counts.networkRequests).toBe(1)
      expect(snapshot.transfers.map(transfer => transfer.phase)).toEqual(["requested", failure ? "failed" : "response"])
      expect(snapshot.transfers.at(-1)?.status).toBe(failure ? undefined : 503)
      expect(snapshot.transfers.every(transfer => transfer.bytes === undefined)).toBeTrue()
    } finally { restore() }
  }
})

class FixtureChannel extends EventTarget {
  static instances: FixtureChannel[] = []
  sent: unknown[] = []
  closed = false
  constructor(_name: string) { super(); FixtureChannel.instances.push(this) }
  postMessage(value: unknown) { this.sent.push(value) }
  close() { this.closed = true }
  request() {
    this.dispatchEvent(new MessageEvent("message", {data: {schema: NETWORK_OBSERVATION_SCHEMA, kind: "snapshot-request"}}))
  }
}

class FixtureSocket extends EventTarget {
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FixtureSocket[] = []
  readyState = 0
  sent: string[] = []
  readonly url: string
  constructor(url: URL) { super(); this.url = String(url); FixtureSocket.instances.push(this) }
  send(text: string) { this.sent.push(text) }
  close() { this.readyState = FixtureSocket.CLOSING }
}

function replaceGlobals(values: Record<string, unknown>) {
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value})
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete (globalThis as Record<string, unknown>)[name]
    }
  }
}
async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}
