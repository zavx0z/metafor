import "./dark.ts"

const server = Bun.serve({
  port: 4002,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "dark"})
      },
    },
  },
})

console.log(`[dark] listening on ${server.url}`)
