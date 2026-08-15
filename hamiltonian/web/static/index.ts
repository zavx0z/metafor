import type {BunRequest} from "bun"
import {staticAssets} from "./macro" with {type: "macro"}

const embeddedAssets = new Map(
  (await staticAssets()).map(([path, asset]) => [
    path,
    {body: Uint8Array.fromBase64(asset.body).buffer, type: asset.type},
  ] as const),
)

/**
 * Возвращает встроенный static asset по пути wildcard route.
 *
 * @param request - Запрос к `/assets/*`.
 * @returns Ответ с asset либо `404`, если путь отсутствует.
 */
export function assets(request: BunRequest<"/assets/*">) {
  const asset = embeddedAssets.get(new URL(request.url).pathname)
  if (!asset) return new Response(null, {status: 404})
  return new Response(asset.body, {headers: {"Content-Type": asset.type}})
}
