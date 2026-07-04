import {file, serve} from "bun"
import "./server.ts"
import "../energy/energy.ts"
import index from "../bulk/index.html"
import {loadMatrixRuntimeSnapshot} from "../matrix/index.ts"

const matrixRuntimeSnapshot = await globalThis.boundary.matrixRuntime()
await loadMatrixRuntimeSnapshot(matrixRuntimeSnapshot)

const server = serve({
  routes: {
    "/": index,
    "/health": () => Response.json({ok: true}),
    "/engine-static/JetBrainsMono-Bold.ttf": file("./pkg/engine/static/JetBrainsMono-Bold.ttf"),
    "/ws": (req, server) => {
      const upgraded = server.upgrade(req)
      return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
    },
  },
  websocket: {
    open(ws) {
      ws.send(JSON.stringify({type: "hello"}))
    },
    message(ws, message) {
      ws.send(message)
    },
  },
})

console.log(`Dark server listening on ${server.url}`)
