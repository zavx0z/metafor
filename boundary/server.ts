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

let forceReconnect: ReturnType<typeof setTimeout> | undefined
let force = new WebSocket("ws://127.0.0.1:4000/ws")
const reconnect = (): void => {
  if (forceReconnect) return
  forceReconnect = setTimeout(() => {
    forceReconnect = undefined
    force = new WebSocket("ws://127.0.0.1:4000/ws")
    force.onopen = register
    force.onclose = reconnect
    force.onerror = reconnect
  }, 500)
}
const register = (): void => {
  force.send(JSON.stringify({type: "register", domain: "boundary", id: "boundary-local"}))
  console.log("[boundary] connected to Force")
}
force.onopen = register
force.onclose = reconnect
force.onerror = reconnect
