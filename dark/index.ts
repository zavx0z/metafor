import "./server.ts"
import "../energy/energy.ts"
import {loadMatrixRuntimeSnapshot} from "../matrix/index.ts"

const matrixRuntimeSnapshot = await globalThis.boundary.matrixRuntime()
await loadMatrixRuntimeSnapshot(matrixRuntimeSnapshot)

const server = Bun.serve({
  routes: {
    "/": () => new Response("Dark"),
    "/health": () => Response.json({ok: true}),
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
