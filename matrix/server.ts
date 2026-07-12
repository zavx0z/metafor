import "./matrix.ts"

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4003),
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "matrix"})
      },
    },
  },
})

console.log(`[matrix] listening on ${server.url}`)
