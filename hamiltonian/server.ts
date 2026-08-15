import routes from "./web/routes"

Bun.serve<{ source: "startup/service" }>({
  routes: {
    "/": routes.static.html,
    "/manifest.webmanifest": routes.static.manifest,
    "/assets/*": routes.static.assets,
    "/startup-main.js": routes.startup.main,
    "/startup-service.js": routes.startup.service,
    "/main.js": routes.import.main,
    "/import-service.js": routes.import.service,
    "/service": (request: Request, server: Bun.Server<{ source: "startup/service" }>) => {
      if (server.upgrade(request, {data: {source: "startup/service"}})) return
      return new Response("WebSocket upgrade required", {status: 426})
    },
  },
  fetch(request) {
    if (request.method === "GET" && request.headers.get("Accept")?.includes("text/html"))
      return routes.static.html.clone()
    return new Response(null, {status: 404})
  },
  websocket: {
    open(socket) {
      console.info(`${socket.data.source} connected`)
    },
    message() {
    },
    close(socket) {
      console.info(`${socket.data.source} disconnected`)
    },
  },
})
