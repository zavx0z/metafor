import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

/** Корень Hamiltonian, внутри которого release server разрешает packages. */
export const hamiltonianRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** Package manifest, фиксирующий последнее доказанное release state. */
export const hamiltonianManifest = join(hamiltonianRoot, "package.json")
