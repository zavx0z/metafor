import {Force} from "force"

const server = Bun.serve({
  port: 4005,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "energy"})
      },
    },
  },
})

console.log(`[energy] listening on ${server.url}`)

globalThis.force = new Force({webSocket: "ws://127.0.0.1:4000/ws", domain: "energy", id: "energy-local"})
globalThis.force.onImpulse((impulse) => {
  console.log(`[energy] <- force parts=${impulse.parts.length}`)
})
