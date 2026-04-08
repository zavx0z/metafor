import {serve} from "bun"
import indexHtml from "./index.html"

const dark = new Worker("./index.ts")

const server = serve({
  port: 4444,
  routes: {
    // Автоматическая сборка и отдача фронтенда
    "/": indexHtml,
    // Обработка WebSocket апгрейда через эндпоинт
    "/ws": {
      GET(req, server) {
        if (server.upgrade(req)) return
        return new Response("Upgrade failed", { status: 400 })
      },
    },
  },
  websocket: {
    open(ws) {
      ws.subscribe("status")
      ws.send(JSON.stringify({ type: "status", status: "ready" }))
    },
    message(ws, message) {
      const data = JSON.parse(String(message))
      if (data.type === "matter" && data.src) {
        dark.postMessage({ src: data.src })
      }
    },
  },
})

dark.onmessage = (event) => {
  server.publish("status", JSON.stringify(event.data))
}

console.log(`server running on https://${server.hostname}:${server.port}`)
