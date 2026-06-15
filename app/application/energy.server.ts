import type {Server, ServerWebSocket} from "bun"
import {force, type Particle} from "boundary"
import {applyRuntimeValueParts, energy$, loadRuntimeSnapshot, type EnergyRuntimeSnapshot} from "energy"

type ForceSocketData = {kind: "force"}

const port = Number(process.env.APPLICATION_ENERGY_PORT ?? 7102)
const darkRuntimeUrl = process.env.ENERGY_DARK_RUNTIME_URL ?? "http://127.0.0.1:7101/energy/runtime"
const sockets = new Set<ServerWebSocket<ForceSocketData>>()

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const loadRuntimeFromDark = async (): Promise<void> => {
  let attempt = 0
  for (;;) {
    attempt += 1
    try {
      const response = await fetch(darkRuntimeUrl)
      if (!response.ok) throw new Error(`Dark runtime snapshot HTTP ${response.status}`)
      const snapshot = await response.json() as EnergyRuntimeSnapshot | {ok: false; error?: string}
      if (snapshot.ok !== true) throw new Error(snapshot.error ?? "Dark runtime snapshot failed")
      await loadRuntimeSnapshot(snapshot)
      console.log(`[energy] runtime loaded from ${darkRuntimeUrl}: branes=${energy$.branes.length}, fields=${energy$.fields.length}`)
      return
    } catch (error) {
      if (attempt === 1 || attempt % 10 === 0) {
        console.warn(`[energy] waiting Dark runtime at ${darkRuntimeUrl}: ${error instanceof Error ? error.message : String(error)}`)
      }
      await delay(Math.min(3000, 200 + attempt * 100))
    }
  }
}

force.observe((event) => {
  void applyRuntimeValueParts(event.data.parts as Particle[]).catch((error) => {
    console.error(`[energy] force message failed: ${error instanceof Error ? error.message : String(error)}`)
  })
})

force.entropy((event) => {
  const payload = JSON.stringify(event.data)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
})

Bun.serve<ForceSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/ws": (req: Request, server: Server<ForceSocketData>) =>
      server.upgrade(req, {data: {kind: "force"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426}),
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    message(_socket, data) {
      void force.absorb(JSON.parse(String(data)))
    },
    close(socket) {
      sockets.delete(socket)
    },
  },
})

void loadRuntimeFromDark()
