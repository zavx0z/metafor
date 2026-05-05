import index from "./index.html"

const port = Number(Bun.env.PORT ?? 1420)

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  development: true,
  routes: { "/": index },
})

console.log(`[space] dev server: http://${server.hostname}:${server.port}`)
