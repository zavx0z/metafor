import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {
  buildStaticStorybook,
  readGitIdentity,
  type StorybookDependencyIdentity,
} from "@zavx0z/storybook/build"
import {
  createQuantumStorybookApp,
  quantumStorybookStaticFiles,
} from "./app.ts"

const metaforRoot = resolve(import.meta.dir, "../..")
const outputRoot = join(import.meta.dir, "dist")
const app = createQuantumStorybookApp()

const manifest = await buildStaticStorybook({
  app,
  outputRoot,
  source: await readGitIdentity(metaforRoot),
  dependencies: await dependencyIdentities(),
  staticFiles: quantumStorybookStaticFiles(),
})

console.log(
  `[Лаборатория Quantum] собрано страниц: ${manifest.pages.length}; каталог: ${outputRoot}; база: /graph/`,
)

async function dependencyIdentities(): Promise<readonly StorybookDependencyIdentity[]> {
  const inputs = [
    ["@engine/core", import.meta.resolve("@engine/core/default-font")],
    ["@layout/core", import.meta.resolve("@layout/core/runtime")],
    ["@metafor/node-tree", import.meta.resolve("@metafor/node-tree/graph")],
    ["@nodes/core", import.meta.resolve("@nodes/core/node-tree")],
    ["@nodes/layout", import.meta.resolve("@nodes/layout/types")],
    ["@nodes/ui", import.meta.resolve("@nodes/ui/node-editor")],
    ["@ui/workspace", import.meta.resolve("@ui/elements/primitives")],
    ["@zavx0z/highlighter", import.meta.resolve("@zavx0z/highlighter")],
    ["@zavx0z/storybook", import.meta.resolve("@zavx0z/storybook/app")],
  ] as const
  return Object.freeze(await Promise.all(inputs.map(async ([name, entry]) => ({
    name,
    ...await readGitIdentity(dirname(fileURLToPath(entry))),
  }))))
}
