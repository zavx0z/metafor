import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {createTemplateJsxBunPlugin} from "@zavx0z/template/bun"

const visualRoot = resolve(import.meta.dir, "..")
const uiRoot = resolve(dirname(fileURLToPath(import.meta.resolve("@zavx0z/ui/buttons/button"))), "..")
const spaceRoot = resolve(dirname(fileURLToPath(import.meta.resolve("@zavx0z/space"))), "..")

/** One compiler pass for Visual and the exact production WebXR components. */
export default createTemplateJsxBunPlugin({
  cwd: visualRoot,
  sourceRoots: [resolve(visualRoot, "main"), uiRoot, spaceRoot],
  styleSourceRootIds: ["@internal/visual", "@zavx0z/ui", "@zavx0z/space"],
})
