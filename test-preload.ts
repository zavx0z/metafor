import {plugin} from "bun"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {createTemplateJsxBunPlugin} from "@zavx0z/template/bun"

plugin(createTemplateJsxBunPlugin({
  persistent: true,
  sourceRoots: [
    resolve(import.meta.dir, "types/.storybook"),
    resolve(import.meta.dir, "quantum/bulk"),
    dirname(fileURLToPath(import.meta.resolve("@ui/components/button"))),
  ],
}))
