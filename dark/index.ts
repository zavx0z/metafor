import {file, serve, type ServerWebSocket} from "bun"
import "./server.ts"
import "../energy/energy.ts"
import index from "../bulk/index.html"
import type {BoundaryUpdateMessage} from "boundary"
import {DEFAULT_BULK_SCENE_SRC} from "bulk/settings"
import {loadMatrixRuntimeSnapshot} from "../matrix/index.ts"

const matrixRuntimeSnapshot = await globalThis.boundary.matrixRuntime()
await loadMatrixRuntimeSnapshot(matrixRuntimeSnapshot)
const sockets = new Set<ServerWebSocket<{kind: "browser"}>>()
const force = new BroadcastChannel("force")

const broadcastForce = (message: BoundaryUpdateMessage): void => {
  const payload = JSON.stringify({type: "force", parts: message.parts})
  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue
    socket.send(payload)
  }
}

const acceptForce = async (message: BoundaryUpdateMessage, publishRuntime: boolean): Promise<void> => {
  await globalThis.boundary.absorb(message)
  if (publishRuntime) {
    const runtimeParts = message.parts.filter((part) => part.part !== "graviton")
    if (runtimeParts.length > 0) force.postMessage({parts: runtimeParts})
  }
  broadcastForce(message)
}

globalThis.boundary.entropy((event) => {
  broadcastForce(event.data)
})

force.onmessage = (event) => {
  const message = event.data as BoundaryUpdateMessage
  if (!Array.isArray(message.parts)) return
  if (!message.parts.some((part) => part.part !== "graviton")) return
  void acceptForce(message, false).catch((error) => console.error("[dark:force]", error))
}

const server = serve<{kind: "browser"}>({
  routes: {
    "/": index,
    "/health": () => Response.json({ok: true}),
    "/engine-static/JetBrainsMono-Bold.ttf": file("./pkg/engine/static/JetBrainsMono-Bold.ttf"),
    "/models/bots.glb": file("./pkg/engine/static/models/bots.glb"),
    "/force": async (req) => {
      if (req.method !== "POST") return new Response("Method Not Allowed", {status: 405})
      let payload: {parts?: unknown}
      try {
        payload = await req.json() as {parts?: unknown}
      } catch (error) {
        return Response.json({ok: false, error: error instanceof Error ? error.message : String(error)}, {status: 400})
      }
      if (!Array.isArray(payload.parts)) return Response.json({ok: false, error: "parts must be an array"}, {status: 400})
      const message: BoundaryUpdateMessage = {parts: payload.parts as BoundaryUpdateMessage["parts"]}
      try {
        await acceptForce(message, true)
        return Response.json({ok: true, parts: message.parts.length})
      } catch (error) {
        return Response.json({ok: false, error: error instanceof Error ? error.message : String(error)}, {status: 400})
      }
    },
    "/ws": (req, server) => {
      const upgraded = server.upgrade(req, {data: {kind: "browser"}})
      return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
    },
  },
  websocket: {
    open(ws) {
      sockets.add(ws)
    },
    close(ws) {
      sockets.delete(ws)
    },
    message(ws, raw) {
      let payload: {type?: unknown; src?: unknown; parts?: unknown}
      try {
        payload = JSON.parse(String(raw)) as {type?: unknown; src?: unknown; parts?: unknown}
      } catch {
        return
      }

      switch (payload.type) {
        case "materialize":
        case "relayout": {
          const src = typeof payload.src === "string" && payload.src.trim().length > 0
            ? payload.src.trim()
            : DEFAULT_BULK_SCENE_SRC
          void globalThis.boundary.bulkRuntime()
            .then((snapshot) => ws.send(JSON.stringify({type: "snapshot", src, snapshot})))
            .catch((error) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
            })
          break
        }
        case "force": {
          if (!Array.isArray(payload.parts)) break
          const message: BoundaryUpdateMessage = {parts: payload.parts as BoundaryUpdateMessage["parts"]}
          void acceptForce(message, true)
            .catch((error) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
            })
          break
        }
      }
    },
  },
})

console.log(`Dark server listening on ${server.url}`)
