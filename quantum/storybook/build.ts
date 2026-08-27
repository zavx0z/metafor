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
  `[Лаборатория Quantum] собрано страниц: ${manifest.pages.length}; каталог: ${outputRoot}; routes: /graph/ + /bulk/`,
)

async function dependencyIdentities(): Promise<readonly StorybookDependencyIdentity[]> {
  const inputs = [
    ["@engine/core", import.meta.resolve("@engine/core/default-font")],
    ["@metafor/node-tree", import.meta.resolve("@metafor/node-tree/graph")],
    ["@ui/components", import.meta.resolve("@ui/components/code-editor")],
    ["@zavx0z/dom", import.meta.resolve("@zavx0z/dom")],
    ["@zavx0z/highlighter", import.meta.resolve("@zavx0z/highlighter")],
    ["@zavx0z/renderer", import.meta.resolve("@zavx0z/renderer")],
    ["@zavx0z/renderer-browser", import.meta.resolve("@zavx0z/renderer-browser")],
    ["@zavx0z/renderer-webgpu", import.meta.resolve("@zavx0z/renderer-webgpu")],
    ["@zavx0z/storybook", import.meta.resolve("@zavx0z/storybook/app")],
  ] as const
  return Object.freeze(await Promise.all(inputs.map(async ([name, entry]) => ({
    name,
    ...await readGitIdentity(dirname(fileURLToPath(entry))),
  }))))
}
