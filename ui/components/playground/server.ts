import {existsSync} from "node:fs"
import {dirname, join} from "node:path"
import index from "./index.html"

const PORT = Number(process.env["COMPONENTS_PLAYGROUND_PORT"] ?? process.env["UI_PLAYGROUND_PORT"] ?? 7902)
const FONT_PATH = join(import.meta.dir, "JetBrainsMono-Bold.ttf")
const MANIFEST = {
  name: "@metafor/components playground",
  short_name: "components",
  start_url: "/",
  display: "standalone",
}

function findYogaWasm(): string | null {
  let dir = import.meta.dir
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, "node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js")
    if (existsSync(cand)) return cand
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  development: {hmr: true},
  routes: {
    "/": index,
    "/manifest.json": () => Response.json(MANIFEST),
    "/*": index,
    "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(FONT_PATH), {headers: {"content-type": "font/ttf"}}),
  },
  fetch(req) {
    const url = new URL(req.url)
    return new Response(`not found: ${req.method} ${url.pathname}`, {status: 404})
  },
})

console.log(`[@metafor/components playground] http://${server.hostname}:${server.port}`)
void findYogaWasm()
