import {basename, join} from "node:path"

const PORT = Number(process.env["COMPONENTS_PLAYGROUND_PORT"] ?? process.env["UI_PLAYGROUND_PORT"] ?? 7902)
const ENTRY_PATH = join(import.meta.dir, "entry.ts")
const STYLE_PATH = join(import.meta.dir, "style.css")
const FONT_PATH = join(import.meta.dir, "JetBrainsMono-Bold.ttf")
const MANIFEST = {
  name: "@ui/components playground",
  short_name: "components",
  start_url: "/",
  display: "standalone",
}
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="cache-control" content="no-cache" />
    <title>@ui/components playground</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <canvas id="stage-canvas"></canvas>
    <script type="module" src="/entry.js"></script>
  </body>
</html>`

let buildAssets = new Map<string, Blob>()

async function buildEntry(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [ENTRY_PATH],
    loader: {
      ".wgsl": "text",
    },
    target: "browser",
    sourcemap: "inline",
  })
  if (!result.success) {
    const body = result.logs.map((log) => String(log)).join("\n")
    return new Response(body, {status: 500, headers: {"content-type": "text/plain; charset=utf-8"}})
  }

  const nextAssets = new Map<string, Blob>()
  let entry: Blob | null = null
  for (const output of result.outputs) {
    const routePath = `/${basename(output.path)}`
    if (routePath === "/entry.js") entry = output
    else nextAssets.set(routePath, output)
  }
  buildAssets = nextAssets
  if (entry === null) {
    return new Response("entry.js was not emitted", {status: 500})
  }
  return new Response(entry, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

function indexResponse(): Response {
  return new Response(INDEX_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  routes: {
    "/": indexResponse,
    "/editor": indexResponse,
    "/manifest.json": () => Response.json(MANIFEST),
    "/style.css": () => new Response(Bun.file(STYLE_PATH), {headers: {"content-type": "text/css; charset=utf-8", "cache-control": "no-cache"}}),
    "/entry.js": buildEntry,
    "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(FONT_PATH), {headers: {"content-type": "font/ttf"}}),
    "/*": (req) => {
      const url = new URL(req.url)
      const asset = buildAssets.get(url.pathname)
      if (asset !== undefined) return new Response(asset)
      return indexResponse()
    },
  },
  fetch(req) {
    const url = new URL(req.url)
    return new Response(`not found: ${req.method} ${url.pathname}`, {status: 404})
  },
})

console.log(`[@ui/components playground] http://${server.hostname}:${server.port}`)
