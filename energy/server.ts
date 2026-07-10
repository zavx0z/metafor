import {startEnergyProtocol} from "./energy.ts"

startEnergyProtocol()

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
