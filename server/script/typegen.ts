import { join } from "path"
import { typegen } from "../../script/typegen"
const rootPath = join(import.meta.dirname, "..", "..")

if (import.meta.main) {
  const fileName = "metafor"
  const entrypoint = join(rootPath, "server", fileName + ".ts")
  const distDir = join(rootPath, "dist")
  const typeDest = join(distDir, "server", `${fileName}.d.ts`)

  await typegen(entrypoint, typeDest)
}
