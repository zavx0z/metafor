import {Force} from "force"

const server = Bun.serve({
  port: 4001,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "boundary"})
      },
    },
  },
})

console.log(`[boundary] listening on ${server.url}`)

globalThis.force = new Force({webSocket: "ws://127.0.0.1:4000/ws", domain: "boundary", id: "boundary-local"})
globalThis.force.onImpulse((impulse) => {
  console.log(`[boundary] <- force parts=${impulse.parts.length}`)
})
