import {join} from "node:path"
import {startPlaygroundServer} from "@ui/playground/server"

const server = startPlaygroundServer({
  name: "@nodes/ui playground",
  title: "Компонентная библиотека нод",
  canvasId: "node-component-canvas",
  hostname: Bun.env.NODES_COMPONENT_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_COMPONENT_PLAYGROUND_PORT ?? 4016),
  entrypoint: join(import.meta.dir, "client.ts"),
  stylePath: join(import.meta.dir, "styles.css"),
  fontPath: join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
  staticFiles: {
    "/node-system-dev/blender-reference.png": join(
      import.meta.dir,
      "../../.agents/skills/node-system-dev/assets/blender-4.5.5-reference.png",
    ),
  },
})

console.log(`Node component playground: ${server.url}`)
