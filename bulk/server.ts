import {file} from "bun"
import index from "./index.html"
import {Force} from "force"

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

globalThis.force = new Force({webSocket: "ws://127.0.0.1:4000/ws", domain: "bulk", id: "bulk-local"})
globalThis.force.onImpulse((impulse) => {
  console.log(`[bulk] <- force parts=${impulse.parts.length}`)
})
