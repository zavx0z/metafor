import metafor from "./web/index.html"

Bun.serve<{ source: "web/service" }>({
  routes: {
    "/": metafor,
    "/service.js": new Response(await Bun.file("./web/service/dist/index.js").bytes(), {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Security-Policy": "script-src 'unsafe-eval'",
        "Content-Type": "text/javascript; charset=utf-8",
      },
    }),
    "/service": (request: Request, server: Bun.Server<{ source: "web/service" }>) => {
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
