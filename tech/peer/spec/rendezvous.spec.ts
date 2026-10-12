import {expect, test} from "bun:test"
import {createRendezvousHandler, createRendezvousServer, type RendezvousSession} from "../rendezvous"
import {connectWebSocketSignaling} from "../signaling"

const token = "test-only-rendezvous-room-token"

test("Rendezvous отвергает неверный token и занятый peer id, не отключая принятого участника", async () => {
  const server = createRendezvousServer({token})
  const first = await connectWebSocketSignaling({url: server.url, id: "same", token})
  try {
    await expect(connectWebSocketSignaling({url: server.url, id: "wrong", token: "incorrect-token-000000"})).rejects.toThrow()
    await expect(connectWebSocketSignaling({url: server.url, id: "same", token})).rejects.toThrow()
    expect(first.open).toBeTrue()
  } finally { first.close()
    await server.close() }
})

test("Rendezvous назначает origin по сессии, запрещает signaling до admission и ограничивает peers", async () => {
  const server = createRendezvousServer({token, maxPeers: 2, authTimeoutMs: 100})
  const a = await connectWebSocketSignaling({url: server.url, id: "a", token})
  const b = await connectWebSocketSignaling({url: server.url, id: "b", token})
  try {
    await expect(connectWebSocketSignaling({url: server.url, id: "c", token})).rejects.toThrow()
    const raw = new WebSocket(server.url)
    const closed = new Promise<number>(resolve => raw.addEventListener("close", event => resolve(event.code)))
    raw.addEventListener("open", () => raw.send(JSON.stringify({type: "signal", signal: {from: "a", to: "b"}})))
    expect(await closed).toBe(1008)
    const sender = new WebSocket(server.url)
    await new Promise<void>(resolve => sender.addEventListener("open", () => resolve()))
    const rejected = new Promise<number>(resolve => sender.addEventListener("close", event => resolve(event.code)))
    sender.send(JSON.stringify({type: "join", id: "a", token}))
    expect(await rejected).toBe(1008)
    const received = new Promise<string>(resolve => b.subscribe(signal => resolve(signal.from)))
    a.send({from: "a", to: "b", generation: "generation", description: {type: "offer", sdp: "test"}})
    expect(await received).toBe("a")
  } finally { a.close()
    b.close()
    await server.close() }
})

test("Авторизованный socket не может подменить origin signaling или назначить RTC introducer", async () => {
  const server = createRendezvousServer({token})
  const receiver = await connectWebSocketSignaling({url: server.url, id: "receiver", token})
  const sender = new WebSocket(server.url)
  try {
    await new Promise<void>(resolve => sender.addEventListener("open", () => resolve()))
    const admitted = new Promise<void>(resolve => sender.addEventListener("message", event => {
      if (JSON.parse(String(event.data)).type === "peers") resolve()
    }))
    sender.send(JSON.stringify({type: "join", id: "actual", token}))
    await admitted
    const received = new Promise<{from: string, via?: string}>(resolve => receiver.subscribe(resolve))
    sender.send(JSON.stringify({type: "signal", signal: {
      from: "forged", to: "receiver", via: "forged-introducer", generation: "generation",
      description: {type: "offer", sdp: "test"},
    }}))
    const signal = await received
    expect(signal.from).toBe("actual")
    expect(signal.via).toBeUndefined()
  } finally { sender.close()
    receiver.close()
    await server.close() }
})

test("Встроенный rendezvous освобождает только собственные WS и сохраняет HTTP и чужой WS одного host", async () => {
  const handler = createRendezvousHandler({token, path: "/network/peer"})
  type HostSession = RendezvousSession | {kind: "echo"}
  const server = Bun.serve<HostSession>({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      const path = new URL(request.url).pathname
      if (path === "/network/peer") return handler.upgrade(request, (request, data) => server.upgrade(request, {data}))
      if (path === "/echo") {
        if (server.upgrade(request, {data: {kind: "echo"}})) return undefined
        return new Response("WebSocket required", {status: 426})
      }
      return new Response("host-alive")
    },
    websocket: {
      ...handler.recommendedWebSocketOptions,
      open(socket) { if (handler.owns(socket.data)) handler.websocket.open(socket) },
      message(socket, message) {
        if (handler.owns(socket.data)) handler.websocket.message(socket, message)
        else socket.send(message)
      },
      close(socket, code, reason) { if (handler.owns(socket.data)) handler.websocket.close(socket, code, reason) },
    },
  })
  const origin = `http://127.0.0.1:${server.port}`
  const signaling = await connectWebSocketSignaling({url: `${origin.replace("http", "ws")}/network/peer`, id: "participant", token})
  const echo = new WebSocket(`${origin.replace("http", "ws")}/echo`)
  try {
    await new Promise<void>(resolve => echo.addEventListener("open", () => resolve()))
    expect(handler.owns({kind: "peer-signaling"})).toBeFalse()
    expect(handler.owns({kind: "echo"})).toBeFalse()
    handler.close()
    const deadline = Date.now() + 1000
    while (signaling.open && Date.now() < deadline) await Bun.sleep(5)
    expect(signaling.open).toBeFalse()
    expect(await (await fetch(origin)).text()).toBe("host-alive")
    expect(echo.readyState).toBe(WebSocket.OPEN)
    const echoed = new Promise<string>(resolve => echo.addEventListener("message", event => resolve(String(event.data)), {once: true}))
    echo.send("still-owned-by-host")
    expect(await echoed).toBe("still-owned-by-host")
    const rejected = await fetch(`${origin}/network/peer`)
    expect(rejected.status).toBe(503)
  } finally { signaling.close()
    echo.close()
    handler.close()
    await server.stop(true) }
})

test("Неудавшийся upgrade и admission timeout освобождают slot встроенного handler", async () => {
  const handler = createRendezvousHandler({token, maxSessions: 1, authTimeoutMs: 20})
  const request = new Request("http://127.0.0.1/peer")
  let session: RendezvousSession | undefined
  const response = handler.upgrade(request, (_request, data) => { session = data
    return false })
  expect(response?.status).toBe(426)
  expect(handler.owns(session)).toBeTrue()
  expect(handler.upgrade(request, () => true)).toBeUndefined()
  expect(handler.upgrade(request, () => true)?.status).toBe(503)
  await Bun.sleep(30)
  expect(handler.upgrade(request, () => false)?.status).toBe(426)
  handler.close()
})
