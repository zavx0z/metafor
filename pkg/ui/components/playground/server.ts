import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  packageName: "@ui/components",
  port: Number(process.env["COMPONENTS_PLAYGROUND_PORT"] ?? process.env["UI_PLAYGROUND_PORT"] ?? 4017),
  entrypoint: join(import.meta.dir, "entry.ts"),
  stylePath: join(import.meta.dir, "style.css"),
  fontPath: join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
  canvasId: "stage-canvas",
})

console.log(`[@ui/components playground] ${server.url}`)
