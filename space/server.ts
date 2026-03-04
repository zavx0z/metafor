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
    "/github/*": async (req) => {
      try {
        const path = new URL(req.url).pathname
        return new Response(Bun.file(path.replace("/github", "../github")))
      } catch (e) {
        console.error(e)
        return new Response("Not Found", { status: 404 })
      }
    },
    "/_bun/client/proc/*": async (req) => {
      try {
        const path = new URL(req.url).pathname
        return new Response(Bun.file(path.replace("/_bun/client", "./")))
      } catch (e) {
        console.error(e)
        return new Response("Not Found", { status: 404 })
      }
    },
  },
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname
    return new Response("Not Found " + path, { status: 404 })
  },
})

console.log(`🚀 Сервер запущен: http://localhost:${server.port}`)
