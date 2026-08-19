import {file} from "bun"
import index from "./index.html"

const server = Bun.serve({
  hostname: Bun.env.NODES_COMPONENT_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_COMPONENT_PLAYGROUND_PORT ?? 4016),
  development: {hmr: false},
  routes: {
    "/": index,
    "/engine-static/JetBrainsMono-Bold.ttf": file(
      new URL("../../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
  },
  fetch() {
    return new Response("Не найдено", {status: 404})
  },
})

console.log(`Node component playground: ${server.url}`)
