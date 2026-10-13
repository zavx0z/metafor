import {expect, test} from "bun:test"
import {connectAgentBrowser} from "../main/agents-browser"
const binding = {id: "chatgpt", service: "chatgpt", host: "codespace", remotePeerId: "remote", executorId: "browser"}
function fixture(screenshot = false) {
  const calls: Array<{url: string, method: string, body: unknown}> = []
  let descriptor: unknown = {instanceId: "instance", profile: "actual-profile", controlEnabled: true, media: {audio: true, microphoneTransport: "rtp"}}
  let selected = binding
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({url: String(url), method: init?.method ?? "GET", body: JSON.parse(init?.body as string)})
    if (init?.method === "DELETE") return new Response(null, {status: 204})
    if (String(url).endsWith("/describe")) return Response.json(descriptor)
    return Response.json({schema: "cosmos:agents/browser/v1", version: 1, ticket: "ticket", expiresAt: Date.now() + 10000, binding: selected, description: descriptor, screenshotProvider: screenshot, iceServers: []})
  }
  const controller = new AbortController()
  return {calls, controller, input: {agentRef: "atom:2", providerRef: "atom:5", binding, url: "/agents", fetch: fetcher, signal: controller.signal},
    changeBinding() {selected = {...binding, host: "other"}}, changeDescription(value: unknown) {descriptor = value}}
}

test("Window facade carries only same-origin ticket and exact binding; explicit close and abort release one viewer", async () => {
  const f = fixture()
  const connection = await connectAgentBrowser(f.input)
  expect(connection.binding).toEqual(binding)
  expect(connection.media).toEqual({audio: true, microphoneTransport: "rtp"})
  expect(await connection.client.describe({peerId: "remote", executorId: "browser"})).toMatchObject({profile: "actual-profile"})
  await expect(connection.client.describe({peerId: "other", executorId: "browser"})).rejects.toThrow()
  f.controller.abort()
  await connection.client.close()
  expect(f.calls.filter(call => call.method === "DELETE")).toHaveLength(1)
  expect(f.calls[0]).toMatchObject({body: {agentRef: "atom:2", providerRef: "atom:5", entryId: "chatgpt"}})
  expect(f.calls.every(call => call.url.startsWith("http://localhost/agents/browser/"))).toBe(true)
  expect(JSON.stringify(f.calls)).not.toMatch(/token|signalingUrl/)
})

test("unknown media remains absent and invalid/mismatched bootstrap releases its acquired ticket", async () => {
  const f = fixture()
  f.changeDescription({instanceId: "instance", profile: "actual", controlEnabled: false})
  const connection = await connectAgentBrowser(f.input)
  expect(connection.media).toBeUndefined()
  await connection.client.close()
  const wrong = fixture()
  wrong.changeBinding()
  await expect(connectAgentBrowser(wrong.input)).rejects.toThrow()
  expect(wrong.calls.filter(call => call.method === "DELETE")).toHaveLength(1)
  const invalid = fixture()
  invalid.changeDescription({instanceId: "instance", profile: "actual", controlEnabled: true, media: {audio: true, microphoneTransport: "invented"}})
  await expect(connectAgentBrowser(invalid.input)).rejects.toThrow()
  expect(invalid.calls.filter(call => call.method === "DELETE")).toHaveLength(1)
})

test("screenshot facade exposes only an advertised exact-profile same-origin ticket and releases binary sockets on close", async () => {
  const legacy = fixture(), f = fixture(true)
  const old = await connectAgentBrowser(legacy.input)
  expect(old.client.screenshotProvider).toBeUndefined()
  await old.client.close()
  class Socket extends EventTarget {
    readyState = 1
    bufferedAmount = 0
    binaryType = "blob"
    sent: Array<string | ArrayBuffer> = []
    send(value: string | ArrayBuffer) {this.sent.push(value)}
    close() {this.readyState = 3; this.dispatchEvent(new CloseEvent("close", {code: 1000}))}
  }
  const sockets: Socket[] = [], endpoints: URL[] = []
  const connection = await connectAgentBrowser({...f.input, socket(url) {endpoints.push(new URL(url)); const socket = new Socket(); sockets.push(socket); return socket as unknown as WebSocket}})
  const select = {peerId: "remote", executorId: "browser", instanceId: "instance", profile: "actual-profile", signal: f.controller.signal}
  try {
    for (const invalid of [{...select, peerId: "other"}, {...select, instanceId: "other"}, {...select, profile: "other"}])
      expect(() => connection.client.screenshotProvider!(invalid)).toThrow()
    expect(sockets).toHaveLength(0)
    const socket = connection.client.screenshotProvider!(select)
    expect(endpoints[0]!.origin).toBe("ws://localhost")
    expect(endpoints[0]!.pathname).toBe("/agents/browser/screenshot")
    expect(Object.fromEntries(endpoints[0]!.searchParams)).toEqual({ticket: "ticket", instanceId: "instance", profile: "actual-profile"})
    expect(sockets[0]!.binaryType).toBe("arraybuffer")
    const bytes = new Uint8Array([137, 80, 78, 71])
    socket.send(bytes)
    expect(new Uint8Array(sockets[0]!.sent[0] as ArrayBuffer)).toEqual(bytes)
    const received: unknown[] = []
    socket.addEventListener("message", event => received.push(event.data))
    sockets[0]!.dispatchEvent(new MessageEvent("message", {data: bytes.buffer}))
    expect(received).toEqual([bytes])
    f.controller.abort()
    await connection.client.close()
    expect(sockets[0]!.readyState).toBe(3)
    expect(() => socket.send(bytes)).toThrow("unavailable")
    expect(f.calls.filter(call => call.method === "DELETE")).toHaveLength(1)
  } finally {await connection.client.close()}
})
