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

const force = new Force("boundary")
force.onImpulse = (impulse) => {
  console.log(`[boundary] <- force parts=${impulse.parts.length}`)
}
