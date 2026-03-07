import { serve } from "bun"
import index from "./index.html"
import { join } from "node:path"

const ROOT_DIRECTORY = join(import.meta.dir, "../../")

const server = serve({
  port: 3000,
  development: {
    hmr: false,
    console: true,
  },
  routes: {
    "/": index,
    "/github/*": async (req) => {
      try {
        const path = new URL(req.url).pathname
        return new Response(Bun.file(join(ROOT_DIRECTORY, path)))
      } catch (e) {
        console.error(e)
        return new Response("Not Found", { status: 404 })
      }
    },
    "/_bun/client/proc/*": async (req) => {
      try {
        const path = new URL(req.url).pathname
        return new Response(Bun.file(join(import.meta.dir, path.replace("/_bun/client/proc", ""))))
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
