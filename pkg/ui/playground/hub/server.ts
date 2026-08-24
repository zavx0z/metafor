import {join} from "node:path"
import {startPlaygroundHubServer} from "@ui/playground/server"
import {createUiPlaygroundPages} from "./server/page-registry.ts"

const server = startPlaygroundHubServer({
  pages: createUiPlaygroundPages(),
  hostname: Bun.env.UI_PLAYGROUND_HOST ?? "127.0.0.1",
  port: Number(Bun.env.UI_PLAYGROUND_PORT ?? 4017),
  staticFiles: {
    "/JetBrainsMono-Bold.ttf": join(import.meta.dir, "../../../engine/static/JetBrainsMono-Bold.ttf"),
  },
})

console.log(`[UI playground catalog] ${server.url}`)
