import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  packageName: "nodes",
  canvasId: "nodes-playground-canvas",
  hostname: Bun.env.NODES_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_PLAYGROUND_PORT ?? 4015),
  entrypoint: join(import.meta.dir, "entry.ts"),
  stylePath: join(import.meta.dir, "style.css"),
  fontPath: join(import.meta.dir, "../../engine/static/JetBrainsMono-Bold.ttf"),
})

console.log(`[nodes playground] ${server.url}`)
