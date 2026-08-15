import type {BunRequest} from "bun"
import html from "./index.html" with {type: "text"}
import manifest from "./manifest.json" with {type: "text"}
import {staticAssets} from "./macro" with {type: "macro"}

const embeddedAssets = new Map(
  (await staticAssets()).map(([path, asset]) => [
    path,
    {body: Uint8Array.fromBase64(asset.body).buffer, type: asset.type},
  ] as const),
)

export const staticRoutes = {
  html: new Response(String(html), {
    headers: {"Content-Type": "text/html; charset=utf-8"},
  }),
  assets: (request: BunRequest<"/assets/*">) => {
    const asset = embeddedAssets.get(new URL(request.url).pathname)
    if (!asset) return new Response(null, {status: 404})
    return new Response(asset.body, {headers: {"Content-Type": asset.type}})
  },
  manifest: new Response(String(manifest), {
    headers: {"Content-Type": "application/manifest+json"},
  }),
}
