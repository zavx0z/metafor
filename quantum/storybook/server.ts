import {fileURLToPath} from "node:url"
import {startStorybookHubServer} from "@ui/storybook/server"
import {createGraphStorybookPage} from "./graph/page.ts"

const server = startStorybookHubServer({
  pages: [createGraphStorybookPage()],
  hostname: Bun.env.QUANTUM_STORYBOOK_HOST ?? "127.0.0.1",
  port: Number(Bun.env.QUANTUM_STORYBOOK_PORT ?? 4019),
  staticFiles: {
    "/fonts/jetbrains-mono-bold.ttf": fileURLToPath(
      import.meta.resolve("@engine/core/fonts/jetbrains-mono-bold.ttf"),
    ),
  },
})

console.log(`[Лаборатория Quantum] ${new URL("/graph/", server.url)}`)
