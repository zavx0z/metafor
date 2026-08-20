import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  packageName: "@nodes/ui",
  canvasId: "node-component-canvas",
  hostname: Bun.env.NODES_COMPONENT_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_COMPONENT_PLAYGROUND_PORT ?? 4016),
  entrypoint: join(import.meta.dir, "client.ts"),
  stylePath: join(import.meta.dir, "styles.css"),
  fontPath: join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
  staticFiles: {
    "/ui-dev/blender-4.5.5-reference.png": join(
      import.meta.dir,
      "../../../ui/.agents/skills/ui-dev/assets/blender-4.5.5-reference.png",
    ),
  },
})

console.log(`Node component playground: ${server.url}`)
