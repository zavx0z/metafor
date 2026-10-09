import {plugin} from "bun"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import createJsxBunPlugin from "@zavx0z/immersive-jsx-compiler-bun"

let registered = false

/** Registers the production TSX compiler for MetaFor-owned browser sources. */
export function registerMetaforTemplatePlugin(): void {
  if (registered) return
  registered = true
  plugin(createJsxBunPlugin({
    persistent: true,
    sourceRoots: [
      resolve(import.meta.dir, "quantum/bulk"),
      dirname(fileURLToPath(import.meta.resolve("@zavx0z/immersive-ui-component-button-basic"))),
    ],
  }))
}
