import {realpath} from "node:fs/promises"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {createPackageBuilder} from "@metafor/tech-build"
import {createRelease} from "@metafor/tech-release"
import {cosmosRoot} from "./shared/paths"

/** Cosmos задаёт разрешённые каталоги и состав; механизм принадлежит tech. */
export const builder = createPackageBuilder({
  profile: Bun.env.NODE_ENV === "development" ? "development" : "production",
  async preparedDependencies(owner) {
    if (owner.env !== "main") return []
    const manifest = await Bun.file(owner.manifest).json()
    if (manifest.name !== "@internal/visual" || !Object.hasOwn(manifest.dependencies ?? {}, "@zavx0z/immersive")) return []
    const inventoryPath = fileURLToPath(import.meta.resolve("@zavx0z/immersive/browser.json"))
    const inventory = await Bun.file(inventoryPath).json()
    if (inventory.schemaVersion !== 1 || inventory.name !== "@zavx0z/immersive")
      throw new Error("Immersive browser inventory is invalid")
    return [{...inventory, root: dirname(inventoryPath)}]
  },
  async resolvePackage(name) {
    if (!/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(name))
      throw new Error(`Invalid package name ${name}`)
    const root = await realpath(join(dirname(cosmosRoot), "node_modules", ...name.split("/")))
    if (root !== cosmosRoot && !root.startsWith(`${cosmosRoot}/`))
      throw new Error(`Package ${name} is outside Cosmos`)
    return root
  },
})

export const release = createRelease({
  root: cosmosRoot,
  builder,
  isMember: (name) => name === "@cosmos/release" || name.startsWith("@internal/"),
})
