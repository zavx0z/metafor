import {plugin} from "bun"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {createTemplateJsxBunPlugin} from "@zavx0z/template/bun"

let registered = false

/** Registers the production TSX compiler for MetaFor-owned browser sources. */
export function registerMetaforTemplatePlugin(): void {
  if (registered) return
  registered = true
  plugin(createTemplateJsxBunPlugin({
    persistent: true,
    sourceRoots: [
      resolve(import.meta.dir, "types/.storybook"),
      resolve(import.meta.dir, "quantum/bulk"),
      dirname(fileURLToPath(import.meta.resolve("@ui/components/button"))),
    ],
  }))
}
