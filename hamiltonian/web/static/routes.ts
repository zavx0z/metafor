import type {BunRequest} from "bun"
import html from "./index.html" with {type: "text"}
import manifest from "./manifest.json" with {type: "text"}
import {staticAssets} from "../../macro" with {type: "macro"}

const embeddedAssets = new Map(
  (await staticAssets()).map(([path, asset]) => [
    path,
    {body: Uint8Array.fromBase64(asset.body).buffer, type: asset.type},
  ] as const),
)

embeddedAssets.set("/assets/fonts/JetBrainsMono-Bold.ttf", {
  body: await Bun.file(
    new URL("../../../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
  ).arrayBuffer(),
  type: "font/ttf",
})

export const statics = {
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
