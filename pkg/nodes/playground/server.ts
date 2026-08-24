import {join} from "node:path"
import {startPlaygroundHubServer} from "@ui/playground/server"
import {createNodesPlaygroundPages} from "./server/page-registry.ts"

const server = startPlaygroundHubServer({
  pages: createNodesPlaygroundPages(),
  hostname: Bun.env.NODES_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.NODES_PLAYGROUND_PORT ?? 4018),
  staticFiles: {
    "/JetBrainsMono-Bold.ttf": join(import.meta.dir, "../../engine/static/JetBrainsMono-Bold.ttf"),
    "/assets/ui/blender-4.5.5-reference.png": join(
      import.meta.dir,
      "packages/ui/blender-4.5.5-reference.png",
    ),
  },
})

console.log(`[nodes playground catalog] ${server.url}`)
