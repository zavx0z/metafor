import {startStorybookPackageServer} from "@zavx0z/storybook/server"
import {
  createQuantumStorybookApp,
  quantumStorybookStaticFiles,
} from "./app.ts"

startStorybookPackageServer({
  app: createQuantumStorybookApp(),
  staticFiles: quantumStorybookStaticFiles(),
})
