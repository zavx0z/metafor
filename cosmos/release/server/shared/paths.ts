import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

/** Корень Cosmos, внутри которого release server разрешает packages. */
export const cosmosRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

/** Package manifest, фиксирующий последнее доказанное release state. */
export const cosmosManifest = join(cosmosRoot, "package.json")
