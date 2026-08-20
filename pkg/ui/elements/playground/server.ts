import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  packageName: "@ui/elements",
  port: Number(process.env["ELEMENTS_PLAYGROUND_PORT"] ?? 7901),
  entrypoint: join(import.meta.dir, "entry.ts"),
  stylePath: join(import.meta.dir, "style.css"),
  fontPath: join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
  canvasId: "stage-canvas",
})

console.log(`[@ui/elements playground] ${server.url}`)
