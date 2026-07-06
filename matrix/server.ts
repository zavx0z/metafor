import {Force} from "force"

const server = Bun.serve({
  port: 4003,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "matrix"})
      },
    },
  },
})

console.log(`[matrix] listening on ${server.url}`)

globalThis.force = new Force({webSocket: "ws://127.0.0.1:4000/ws", domain: "matrix", id: "matrix-local"})
globalThis.force.onImpulse((impulse) => {
  console.log(`[matrix] <- force parts=${impulse.parts.length}`)
})

await import("./matrix.ts")
