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

const force = new Force("energy")
force.onImpulse = (impulse) => {
  console.log(`[energy] <- force parts=${impulse.parts.length}`)
}
