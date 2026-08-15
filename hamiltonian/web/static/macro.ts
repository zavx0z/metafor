import {file, fileURLToPath, Glob} from "bun"

type StaticAssetEntry = [path: string, asset: {body: string; type: string}]

/**
 * Встраивает static assets в server во время Bun transpilation.
 *
 * Filesystem сканируется только внутри macro. Возвращаемые base64 bytes и MIME
 * type сериализуются в server module, поэтому route не читает файлы в runtime.
 *
 * @returns Отсортированные route path и данные каждого static asset.
 */
export async function staticAssets(): Promise<StaticAssetEntry[]> {
  const root = fileURLToPath(new URL("../../assets", import.meta.url))
  const paths = Array.from(new Glob("**/*").scanSync(root)).sort()

  return await Promise.all(paths.map(async (path): Promise<StaticAssetEntry> => {
    const asset = file(`${root}/${path}`)
    const body = new Uint8Array(await asset.arrayBuffer()).toBase64()
    return [`/assets/${path}`, {body, type: asset.type}]
  }))
}
