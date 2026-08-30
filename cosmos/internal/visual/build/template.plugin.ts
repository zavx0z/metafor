import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {createTemplateJsxBunPlugin} from "@zavx0z/template/bun"

const visualRoot = resolve(import.meta.dir, "..")
const visualMainRoot = resolve(visualRoot, "main")
const uiComponentsRoot = dirname(
  fileURLToPath(import.meta.resolve("@ui/components/button")),
)

/** Compiles Visual and its exact production UI owners in one package build. */
export default createTemplateJsxBunPlugin({
  cwd: visualRoot,
  sourceRoots: [visualMainRoot, uiComponentsRoot],
  styleSourceRootIds: ["@internal/visual", "@ui/components"],
})
