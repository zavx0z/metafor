import routes from "./web/routes"

Bun.serve<{ source: "web/service" }>({
  routes: {
    "/": routes.static.html,
    "/manifest.webmanifest": routes.static.manifest,
    "/assets/*": routes.static.assets,
    "/import.js": routes.startup.importer,
    "/service.js": routes.startup.service,
    "/main.js": new Response(await Bun.file("./web/main/dist/main.js").bytes(), {
      headers: {"Content-Type": "text/javascript; charset=utf-8"},
    }),
    "/service": (request: Request, server: Bun.Server<{ source: "web/service" }>) => {
      if (server.upgrade(request, {data: {source: "web/service"}})) return
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
