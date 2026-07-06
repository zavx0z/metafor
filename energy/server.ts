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
  force.send(JSON.stringify({type: "register", domain: "energy", id: "energy-local"}))
  console.log("[energy] connected to Force")
}
force.onopen = register
force.onclose = reconnect
force.onerror = reconnect
