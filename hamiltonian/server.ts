import metafor from "./web/index.html"

Bun.serve<{ source: "web/service" }>({
  routes: {
    "/": metafor,
    "/service.js": new Response(await Bun.file("./web/service/dist/index.js").bytes(), {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "text/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
      },
    }),
    "/control": (request: Request, server: Bun.Server<{ source: "web/service" }>) => {
      if (server.upgrade(request, {data: {source: "web/service"}})) return
      return new Response("WebSocket upgrade required", {status: 426})
    },
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
