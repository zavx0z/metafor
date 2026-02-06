import { serve } from "bun"
import index from "./index.html"

const server = serve({
  port: 3000,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    "/": index,
  },
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname
    return new Response("Not Found " + path, { status: 404 })
  },
})

console.log(`🚀 Сервер запущен: http://localhost:${server.port}`)
