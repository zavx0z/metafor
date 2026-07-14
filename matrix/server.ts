import "./matrix.ts"
import {weak$} from "@matrix/weak"

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4003),
  routes: {
    "/health": {
      GET() {
        return Response.json({
          ok: true,
          domain: "matrix",
          backend: weak$.mode,
          initialized: weak$.initialized,
        })
      },
    },
  },
})

console.log(`[matrix] listening on ${server.url}`)
