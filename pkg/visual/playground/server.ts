import {file} from "bun"
import index from "./index.html"

const server = Bun.serve({
  hostname: Bun.env.VISUAL_HOST ?? "0.0.0.0",
  port: Number(Bun.env.VISUAL_PORT ?? 4014),
  routes: {
    "/": index,
    "/engine-static/JetBrainsMono-Bold.ttf": file(
      new URL("../../engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
  },
})

console.log(`Visual playground: ${server.url}`)
