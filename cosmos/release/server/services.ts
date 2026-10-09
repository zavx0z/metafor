import {realpath} from "node:fs/promises"
import {dirname, join} from "node:path"
import {createPackageBuilder} from "@metafor/tech-build"
import {createRelease} from "@metafor/tech-release"
import {cosmosRoot} from "./shared/paths"

/** Cosmos задаёт разрешённые каталоги и состав; механизм принадлежит tech. */
export const builder = createPackageBuilder({
  profile: Bun.env.NODE_ENV === "development" ? "development" : "production",
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
