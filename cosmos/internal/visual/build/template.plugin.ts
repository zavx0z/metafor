import {resolve} from "node:path"
import createJsxBunPlugin from "@zavx0z/immersive/compiler"

const visualRoot = resolve(import.meta.dir, "..")

/** Visual компилирует собственные компоненты; Immersive предоставляет готовые. */
export default createJsxBunPlugin({
  cwd: visualRoot,
  sourceRoots: [resolve(visualRoot, "main")],
  styleSourceRootIds: ["@internal/visual"],
})
