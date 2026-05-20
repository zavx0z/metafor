import {existsSync} from "node:fs"
import {dirname, join} from "node:path"
import index from "./index.html"

const PORT = Number(process.env["ELEMENTS_PLAYGROUND_PORT"] ?? process.env["UI_PLAYGROUND_PORT"] ?? 7901)
const FONT_PATH = join(import.meta.dir, "JetBrainsMono-Bold.ttf")

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
  development: true,
  routes: {
    "/": index,
    "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(FONT_PATH), {headers: {"content-type": "font/ttf"}}),
  },
  fetch(req): Response {
    const url = new URL(req.url)
    return new Response(`not found: ${req.method} ${url.pathname}`, {status: 404})
  },
})

console.log(`[@metafor/elements playground] http://${server.hostname}:${server.port}`)
void findYogaWasm()
