import type {ServerWebSocket} from "bun"
import {bootBoundaryDomain} from "@metafor/boundary/boot"
import {open} from "store/sqlite"
import type {ForceMessage, ForceMessageHandler, Store} from "store"

type ForceSocketData = {kind: "force"}

const store = await open(process.env.APPLICATION_BOUNDARY_STORE ?? "tmp/boundary.sqlite")
;(globalThis as typeof globalThis & {store: Store}).store = store
bootBoundaryDomain(() => store as never)

const port = Number(process.env.APPLICATION_BOUNDARY_PORT ?? 7102)
const peerUrl = process.env.APPLICATION_DARK_URL
const sockets = new Set<ServerWebSocket<ForceSocketData>>()
const peer = peerUrl ? new WebSocket(peerUrl) : null
let inbound = 0

const send = (message: ForceMessage): void => {
  const payload = JSON.stringify(message)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
  if (peer?.readyState === WebSocket.OPEN) peer.send(payload)
}

const post = (message: ForceMessage): void => {
  inbound += 1
  try {
    store.postMessage(message)
  } finally {
    inbound -= 1
  }
}

const receive = (data: string | Buffer): void => {
  post(JSON.parse(String(data)) as ForceMessage)
}

const previousOnMessage = store.onmessage
store.onmessage = function (event) {
  if (inbound === 0) send(event.data)
  return previousOnMessage?.call(this, event)
} satisfies NonNullable<ForceMessageHandler>

peer?.addEventListener("message", (event) => receive(String(event.data)))
peer?.addEventListener("error", () => peer.close())

Bun.serve<ForceSocketData>({
  hostname: "127.0.0.1",
  port,
  fetch(req, server) {
    if (new URL(req.url).pathname !== "/ws") return new Response("WebSocket upgrade failed", {status: 426})
    return server.upgrade(req, {data: {kind: "force"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426})
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    message(_socket, data) {
      receive(data)
    },
    close(socket) {
      sockets.delete(socket)
    },
  },
})
