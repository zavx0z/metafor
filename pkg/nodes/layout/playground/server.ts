import index from "./index.html"

const server = Bun.serve({
  hostname: Bun.env.NODES_LAYOUT_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_LAYOUT_PLAYGROUND_PORT ?? 4015),
  development: {hmr: true},
  routes: {"/": index},
  fetch() {
    return new Response("Не найдено", {status: 404})
  },
})

console.log(`Стенд раскладки нод: ${server.url}`)
