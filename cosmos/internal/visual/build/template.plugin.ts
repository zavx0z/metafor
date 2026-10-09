import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import createJsxBunPlugin from "@zavx0z/immersive-jsx-compiler-bun"

const visualRoot = resolve(import.meta.dir, "..")
const uiRoot = dirname(fileURLToPath(import.meta.resolve("@zavx0z/immersive-ui-component")))
const spaceRoot = resolve(dirname(fileURLToPath(import.meta.resolve("@zavx0z/immersive-space"))), "..")
const nodesRoot = resolve(dirname(fileURLToPath(import.meta.resolve("@zavx0z/immersive-nodes/frame"))), "..")

/** One compiler pass for Visual and its public Immersive components. */
export default createJsxBunPlugin({
  cwd: visualRoot,
  sourceRoots: [resolve(visualRoot, "main"), uiRoot, spaceRoot, nodesRoot],
  styleSourceRootIds: ["@internal/visual", "@zavx0z/immersive-ui-component", "@zavx0z/immersive-space", "@zavx0z/immersive-nodes"],
})
