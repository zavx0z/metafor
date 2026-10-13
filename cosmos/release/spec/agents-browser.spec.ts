import {expect, test} from "bun:test"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import type {ProviderCatalogEntry, ProviderRegistry} from "@metafor/types/metafor/providers"
import type {BrowserPeerEvents, BrowserPeerSocket, BrowserPeerScreenshotSocket, BrowserPeerScreenshotEvents} from "@zavx0z/provider-tech-peer/browser-types"
import {createAgentBrowserBridge, type AgentBrowserSocketData} from "../server/agents-browser"
import type {AgentBrowserBootstrap} from "../shared/agents-browser"

const binding = {id: "chatgpt-codespace", service: "chatgpt", host: "codespace", remotePeerId: "remote", executorId: "browser", assignmentId: "assigned"}
function fixture(lifetimeMs?: number, screenshot = false, iceServers?: AgentBrowserBootstrap["iceServers"]) {
  const entry: ProviderCatalogEntry = {...binding, source: {kind: "native-bootstrap", assignmentId: "assigned", remoteGraph: "unknown"}, resolution: "exact", connection: "connected",
    capabilities: {modelTurn: true, browserPreview: true, browserControl: true}, checks: {status: "unknown", checkedAt: 1, message: null}}
  const registry: ProviderRegistry = {schema: "metafor/provider-registry/v1", version: 1, revision: 1, settings: {selectedId: entry.id}, entries: [entry], observations: [], requests: [], members: [],
    discovery: {localGraph: "exact", admittedPeers: "unknown", remoteGraphs: [], issues: []}}
  const atom = (ref: string, meta: string, values: Record<string, unknown> = {}, children?: RuntimeAtom[]): RuntimeAtom => ({kind: "atom", ref: ref as RuntimeAtom["ref"], meta: parseMetaAddress(meta)!, values: values as RuntimeAtom["values"], declaration: "#/template/x", state: "ready", mass: [], ...(children ? {children} : {})}) as RuntimeAtom
  const executor = atom("atom:4", "@metafor/provider", {registryMode: "executor"})
  const owner = atom("atom:5", "@metafor/provider", {registryMode: "owner"})
  for (const provider of [executor, owner]) provider.mass.push({ref: "mass:registry", key: "registry", format: "json", label: null, description: null, content: "lazy"})
  const graph = {schema: GRAPH_SCHEMA, root: parseMetaAddress("@fixture/root")!, template: {}, runtime: {roots: [atom("atom:1", "@fixture/root", {}, [atom("atom:2", "@metafor/agent", {}, [atom("atom:3", "@metafor/chat", {}, [executor])]), owner])], reactions: []}} as Graph
  let nativeCalls = 0, closes = 0, admitted = true
  const payloads: string[] = []
  const calls: string[] = []
  const screenshotPayloads: Array<string | Uint8Array> = []
  let screenshotCloses = 0, screenshotProfile = "actual-profile"
  const bridge = createAgentBrowserBridge({...(lifetimeMs ? {lifetimeMs} : {}), ...(iceServers === undefined ? {} : {iceServers}), admitted: () => admitted,
    peer: {async call<T>(_target: string, method: string, input: unknown): Promise<T> {
      calls.push(method)
      if (method === "readGraph") return structuredClone(graph) as T
      expect(input).toMatchObject({atom: {ref: "atom:5", meta: "@metafor/provider"}, key: "registry"})
      return {contractVersion: 1, resolution: "exact", atom: {root: graph.root, ref: owner.ref, meta: owner.meta}, key: "registry", bytes: 100,
        content: {format: "json", present: true, value: structuredClone(registry)}} as T
    }},
    native: async (selected, signal) => {
      nativeCalls++
      expect(selected).toEqual(binding)
      signal.throwIfAborted()
      return {async close() {closes++}, client: {
        async describe(selection) {expect(selection).toMatchObject({peerId: "remote", executorId: "browser"}); return {instanceId: "instance", profile: screenshotProfile, controlEnabled: true, media: {audio: true, microphoneTransport: "rtp"}}},
        async close() {},
        ...(screenshot ? {screenshotProvider(selection: {peerId: string; executorId: string; instanceId: string; profile: string}): BrowserPeerScreenshotSocket {
          expect(selection).toMatchObject({peerId: "remote", executorId: "browser", instanceId: "instance", profile: screenshotProfile})
          const events = new Map<keyof BrowserPeerScreenshotEvents, (event: never) => void>()
          let readyState = 0
          const socket: BrowserPeerScreenshotSocket = {get readyState() {return readyState}, bufferedAmount: 0,
            send(value) {expect(readyState).toBe(1); screenshotPayloads.push(value); events.get("message")?.({type: "message", data: value} as never)},
            close() {if (readyState !== 3) screenshotCloses++; readyState = 3}, addEventListener(type, listener) {events.set(type, listener as (event: never) => void)}}
          setTimeout(() => {if (readyState === 3) return; readyState = 1; events.get("open")?.({type: "open"} as never)}, 20)
          return socket
        }} : {}),
        socket() {
          const events = new Map<keyof BrowserPeerEvents, (event: never) => void>()
          let readyState = 0
          const socket: BrowserPeerSocket = {get readyState() {return readyState}, bufferedAmount: 0,
            send(value) {expect(readyState).toBe(1); payloads.push(value); events.get("message")?.({type: "message", data: `native:${value}`} as never)},
            close() {readyState = 3}, addEventListener(type, listener) {events.set(type, listener as (event: never) => void)}}
          setTimeout(() => {readyState = 1; events.get("open")?.({type: "open"} as never)}, 20)
          return socket
        },
      }}
    }})
  const server = Bun.serve<AgentBrowserSocketData>({hostname: "127.0.0.1", port: 0, fetch: bridge.fetch, websocket: bridge.websocket})
  const origin = server.url.origin
  const request = (path: string, value: unknown, method = "POST", source = origin) => fetch(`${origin}/agents/browser/${path}`, {method, headers: {Origin: source, "Content-Type": "application/json"}, body: JSON.stringify(value)})
  return {entry, graph, registry, calls, payloads, screenshotPayloads, origin, request, bridge, nativeCalls: () => nativeCalls, closes: () => closes, screenshotCloses: () => screenshotCloses,
    changeProfile() {screenshotProfile = "other-profile"},
    revoke() {admitted = false}, async close() {await bridge.close(); await server.stop(true)}}
}
const selection = {agentRef: "atom:2", providerRef: "atom:5", entryId: binding.id}

test("viewer selects canonical registry owner by Mass alias, never executor's private catalog; credentials stay native", async () => {
  const f = fixture()
  try {
    const response = await f.request("bootstrap", selection)
    expect(response.status).toBe(200)
    const lease = await response.json() as AgentBrowserBootstrap
    expect(lease).toMatchObject({schema: "cosmos:agents/browser/v1", binding, iceServers: [{urls: "stun:stun.l.google.com:19302"}], description: {profile: "actual-profile", media: {audio: true, microphoneTransport: "rtp"}}})
    expect(JSON.stringify(lease)).not.toMatch(/signalingUrl|token|wss:/)
    expect(f.calls).toEqual(["readGraph", "energy.mass.result.read", "readGraph", "energy.mass.result.read", "readGraph", "energy.mass.result.read"])
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(200)
    expect((await f.request("bootstrap", {ticket: lease.ticket}, "DELETE")).status).toBe(204)
    expect(f.closes()).toBe(1)
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(409)
  } finally {await f.close()}
})

test("scope, origin, extra parameters and changed registry reject before native browser opens", async () => {
  const f = fixture()
  try {
    for (const value of [{...selection, providerRef: "atom:4"}, {...selection, agentRef: "atom:99"}, {...selection, endpoint: "http://arbitrary"}]) expect((await f.request("bootstrap", value)).ok).toBe(false)
    expect((await f.request("bootstrap", selection, "POST", "http://outsider")).ok).toBe(false)
    expect(f.nativeCalls()).toBe(0)
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    f.entry.executorId = "replacement"
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(409)
    f.revoke()
    expect((await f.request("bootstrap", selection)).status).toBe(409)
  } finally {await f.close()}
})

test("raw signaling queues initial client data until native open and closes only its exclusive lease", async () => {
  const f = fixture()
  try {
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    const url = `${f.origin.replace("http:", "ws:")}/agents/browser/socket?${new URLSearchParams({ticket: lease.ticket, instanceId: "instance", viewerPeerId: "viewer"})}`
    const NativeWebSocket = WebSocket as unknown as {new(url: string, options: {headers: Record<string, string>}): WebSocket}
    const socket = new NativeWebSocket(url, {headers: {Origin: f.origin}})
    const received = Promise.withResolvers<string>()
    socket.addEventListener("open", () => socket.send("offer"))
    socket.addEventListener("message", event => received.resolve(String(event.data)))
    expect(await Promise.race([received.promise, Bun.sleep(2000).then(() => "timeout")])).toBe("native:offer")
    expect(f.payloads).toEqual(["offer"])
    socket.close()
    for (let attempt = 0; attempt < 50 && !f.closes(); attempt++) await Bun.sleep(5)
    expect(f.closes()).toBe(1)
  } finally {await f.close()}
})

test("short ticket expiry releases the acquired viewer without any model or mutation", async () => {
  const f = fixture(25)
  try {
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    await Bun.sleep(50)
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(409)
    expect(f.closes()).toBe(1)
    expect(f.calls.every(method => method === "readGraph" || method === "energy.mass.result.read")).toBe(true)
  } finally {await f.close()}
})

test("same-origin screenshot relay pins profile and instance, carries PNG bytes, and closes independently of RTC", async () => {
  const f = fixture(undefined, true)
  const NativeWebSocket = WebSocket as unknown as {new(url: string, options: {headers: Record<string, string>}): WebSocket}
  try {
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    expect(lease.screenshotProvider).toBeTrue()
    const endpoint = `${f.origin.replace("http:", "ws:")}/agents/browser/screenshot?${new URLSearchParams({ticket: lease.ticket, instanceId: "instance", profile: "actual-profile"})}`
    const png = new Uint8Array(128 * 1024).fill(42)
    const socket = new NativeWebSocket(endpoint, {headers: {Origin: f.origin}})
    socket.binaryType = "arraybuffer"
    const received: Array<string | Uint8Array> = []
    socket.addEventListener("message", event => received.push(typeof event.data === "string" ? event.data : new Uint8Array(event.data)))
    const ready = Promise.withResolvers<void>()
    socket.addEventListener("open", () => {socket.send(JSON.stringify({v: 1, type: "screenshot.result", instanceId: "instance", requestId: "owner-save"})); socket.send(png); ready.resolve()})
    await ready.promise
    for (let attempt = 0; attempt < 100 && received.length < 2; attempt++) await Bun.sleep(5)
    expect(received).toEqual([JSON.stringify({v: 1, type: "screenshot.result", instanceId: "instance", requestId: "owner-save"}), png])
    expect(f.screenshotPayloads).toEqual(received)
    expect((await fetch(endpoint.replace("ws:", "http:"), {headers: {Origin: f.origin}})).status).toBe(409)
    socket.close()
    for (let attempt = 0; attempt < 100 && !f.screenshotCloses(); attempt++) await Bun.sleep(2)
    expect(f.screenshotCloses()).toBe(1)
    expect(f.closes()).toBe(0)
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(200)
    f.changeProfile()
    expect((await fetch(endpoint.replace("ws:", "http:"), {headers: {Origin: f.origin}})).status).toBe(409)
    expect((await fetch(endpoint.replace("ws:", "http:"), {headers: {Origin: "https://outsider.invalid"}})).status).toBe(409)
    expect((await f.request("bootstrap", {ticket: lease.ticket}, "DELETE")).status).toBe(204)
    expect(f.closes()).toBe(1)
  } finally {await f.close()}
})

test("browser media bootstrap preserves an explicitly local-only ICE policy", async () => {
  const f = fixture(undefined, false, [])
  try {
    const response = await f.request("bootstrap", selection)
    expect(response.status).toBe(200)
    const lease = await response.json() as AgentBrowserBootstrap
    expect(lease.iceServers).toEqual([])
  } finally {await f.close()}
})

test("active viewer renewal keeps the same native lease beyond its original expiry and replaces one expiry timer", async () => {
  const f = fixture(400)
  try {
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    await Bun.sleep(150)
    const first = await f.request("renew", {ticket: lease.ticket})
    expect(first.status).toBe(200)
    const renewed = await first.json()
    expect(renewed).toMatchObject({schema: "cosmos:agents/browser-renewal/v1", version: 1, ticket: lease.ticket})
    expect(renewed.expiresAt).toBeGreaterThan(lease.expiresAt)
    await Bun.sleep(300)
    expect(Date.now()).toBeGreaterThan(lease.expiresAt)
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(200)
    expect((await f.request("renew", {ticket: lease.ticket})).status).toBe(200)
    await Bun.sleep(200)
    expect(Date.now()).toBeGreaterThan(renewed.expiresAt)
    expect((await f.request("describe", {ticket: lease.ticket})).status).toBe(200)
    expect(f.nativeCalls()).toBe(1)
    expect(f.closes()).toBe(0)
    expect(f.calls.every(method => method === "readGraph" || method === "energy.mass.result.read")).toBe(true)
    expect((await f.request("bootstrap", {ticket: lease.ticket}, "DELETE")).status).toBe(204)
    expect(f.closes()).toBe(1)
  } finally {await f.close()}
})

test("renewal revalidates Mass binding and enabled configuration; revocation closes the owned lease immediately", async () => {
  for (const change of ["binding", "disabled", "admission"] as const) {
    const f = fixture()
    try {
      const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
      if (change === "binding") f.entry.executorId = "replacement"
      if (change === "admission") f.revoke()
      if (change === "disabled") f.registry.settings = {selectedId: null,
        configuration: {schemaVersion: 1, revision: 1, connections: [{id: binding.id, provider: "capsule", label: "Disabled", enabled: false,
          peer: {peerId: binding.remotePeerId, executorId: binding.executorId}, endpoint: {url: "", profile: "actual-profile", service: "chatgpt"}}], general: {}, types: {}},
        connectionBindings: {[binding.id]: null}, connectionChecks: {[binding.id]: {status: "unknown", checkedAt: null, message: null}}}
      expect((await f.request("renew", {ticket: lease.ticket})).status).toBe(409)
      expect(f.closes()).toBe(1)
      expect(f.nativeCalls()).toBe(1)
      expect((await f.request("renew", {ticket: lease.ticket})).status).toBe(409)
      expect(f.closes()).toBe(1)
    } finally {await f.close()}
  }
})

test("renewal rejects foreign origin or extra fields without revoking the ticket, and cannot revive an expired grant", async () => {
  const f = fixture()
  try {
    const lease = await (await f.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    expect((await f.request("renew", {ticket: lease.ticket}, "POST", "https://outsider.invalid")).status).toBe(409)
    expect((await f.request("renew", {ticket: lease.ticket, expiresAt: Date.now() + 900000})).status).toBe(409)
    expect(f.closes()).toBe(0)
    expect((await f.request("renew", {ticket: lease.ticket})).status).toBe(200)
    expect(f.nativeCalls()).toBe(1)
  } finally {await f.close()}
  const expired = fixture(25)
  try {
    const lease = await (await expired.request("bootstrap", selection)).json() as AgentBrowserBootstrap
    await Bun.sleep(50)
    expect((await expired.request("renew", {ticket: lease.ticket})).status).toBe(409)
    expect(expired.closes()).toBe(1)
    expect(expired.nativeCalls()).toBe(1)
  } finally {await expired.close()}
})
