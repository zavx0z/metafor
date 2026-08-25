import {startStorybookHubServer} from "@zavx0z/storybook/server"
import {
  createQuantumStorybookApp,
  quantumStorybookStaticFiles,
} from "./app.ts"

const server = startStorybookHubServer({
  app: createQuantumStorybookApp(),
  hostname: Bun.env.QUANTUM_STORYBOOK_HOST ?? "127.0.0.1",
  port: Number(Bun.env.QUANTUM_STORYBOOK_PORT ?? 4019),
  staticFiles: quantumStorybookStaticFiles(),
})

console.log(`[Лаборатория Quantum] ${new URL("/graph/", server.url)}`)
