import index from "./index.html"

const port = Number(Bun.env.PORT ?? 1420)
const MANIFEST = {
  name: "MetaFor Space",
  short_name: "space",
  start_url: "/",
  display: "standalone",
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  development: {hmr: true},
  routes: {
    "/": index,
    "/manifest.json": () => Response.json(MANIFEST),
    "/*": index,
  },
})

console.log(`[space] dev server: http://${server.hostname}:${server.port}`)
