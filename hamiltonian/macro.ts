import {file, fileURLToPath, Glob} from "bun"
import {join} from "node:path"

/** Один встроенный static asset и принадлежащий ему HTTP path. */
export type StaticAssetEntry = [path: string, asset: {body: string; type: string}]

/**
 * Встраивает Hamiltonian static assets в вызывающий route.
 *
 * @returns Отсортированные route path и сериализованные данные assets.
 */
export async function staticAssets(): Promise<StaticAssetEntry[]> {
  const root = fileURLToPath(new URL("./assets", import.meta.url))
  const paths = Array.from(new Glob("**/*").scanSync(root)).sort()

  return await Promise.all(paths.map(async (path): Promise<StaticAssetEntry> => {
    const asset = file(join(root, path))
    const body = new Uint8Array(await asset.arrayBuffer()).toBase64()
    return [`/assets/${path}`, {body, type: asset.type}]
  }))
}
