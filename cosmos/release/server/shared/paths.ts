import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"

/** Корень Cosmos, внутри которого release server разрешает packages. */
export const cosmosRoot = resolveCosmosRoot()

/** Package manifest, фиксирующий последнее доказанное release state. */
export const cosmosManifest = join(cosmosRoot, "package.json")

/** Удерживает один root для source и перемещённого immutable server artifact. */
export function resolveCosmosRoot(
  moduleUrl = import.meta.url,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured = env.COSMOS_ROOT?.trim()
  return configured
    ? resolve(configured)
    : dirname(dirname(dirname(dirname(fileURLToPath(moduleUrl)))))
}
