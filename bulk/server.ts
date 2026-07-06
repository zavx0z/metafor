import {file} from "bun"
import index from "./index.html"

const server = Bun.serve({
  port: 4004,
  routes: {
    "/": index,
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "bulk"})
      },
    },
    "/engine-static/JetBrainsMono-Bold.ttf": file(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)),
    "/models/bots.glb": file(new URL("../pkg/engine/static/models/bots.glb", import.meta.url)),
  },
})

console.log(`[bulk] listening on ${server.url}`)

let forceReconnect: ReturnType<typeof setTimeout> | undefined
let force = new WebSocket("ws://127.0.0.1:4000/ws")
const reconnect = (): void => {
  if (forceReconnect) return
  forceReconnect = setTimeout(() => {
    forceReconnect = undefined
    force = new WebSocket("ws://127.0.0.1:4000/ws")
    force.onopen = register
    force.onclose = reconnect
    force.onerror = reconnect
  }, 500)
}
const register = (): void => {
  force.send(JSON.stringify({type: "register", domain: "bulk", id: "bulk-local"}))
  console.log("[bulk] connected to Force")
}
force.onopen = register
force.onclose = reconnect
force.onerror = reconnect
