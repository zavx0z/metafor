import { join } from "path"
import { typegen } from "../../script/typegen"
const rootPath = join(import.meta.dirname, "..", "..")

if (import.meta.main) {
  const fileName = "metafor"
  const entrypoint = join(rootPath, "web", fileName + ".ts")
  const distDir = join(rootPath, "dist")
  const typeDest = join(distDir, "web", `${fileName}.d.ts`)

  await typegen(entrypoint, typeDest)
}
