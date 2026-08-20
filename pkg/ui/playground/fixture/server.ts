import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  packageName: "@ui/playground",
  port: Number(Bun.env.UI_PLAYGROUND_FIXTURE_PORT ?? 4192),
  entrypoint: join(import.meta.dir, "entry.ts"),
  stylePath: join(import.meta.dir, "style.css"),
  fontPath: join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
})

console.log(`[@ui/playground fixture] ${server.url}`)
