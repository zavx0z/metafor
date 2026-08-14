import type {BunRequest} from "bun"

const map = new Map<string, { body: ArrayBuffer; type: string }>()

for await (const path of new Bun.Glob("**/*").scan("./assets")) {
  const file = Bun.file(`./assets/${path}`)
  map.set(`/assets/${path}`, {body: await file.arrayBuffer(), type: file.type})
}

/**
 * Отдаёт static asset из снимка, собранного при запуске server process.
 *
 * Request никогда не преобразуется в произвольный filesystem path: handler
 * обслуживает только точное pathname, найденное startup scan.
 *
 * @param request - Запрос к route `/assets/*`.
 * @returns Буферизованный asset с обнаруженным MIME type либо `404`.
 */
export const assets = (request: BunRequest<"/assets/*">) => {
  const asset = map.get(new URL(request.url).pathname)
  if (!asset) return new Response(null, {status: 404})
  return new Response(asset.body, {headers: {"Content-Type": asset.type}})
}
