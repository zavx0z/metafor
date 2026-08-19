import {basename} from "node:path"

export type PlaygroundServerOptions = Readonly<{
  name: string
  port: number
  entrypoint: string
  stylePath: string
  fontPath: string
  title?: string
  hostname?: string
}>

export function startPlaygroundServer(options: PlaygroundServerOptions): ReturnType<typeof Bun.serve> {
  const hostname = options.hostname ?? "127.0.0.1"
  const title = options.title ?? options.name
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <base href="/">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="cache-control" content="no-cache">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <canvas id="playground-canvas"></canvas>
    <script type="module" src="/entry.js"></script>
  </body>
</html>`
  let buildAssets = new Map<string, Blob>()

  const buildEntry = async (): Promise<Response> => {
    const result = await Bun.build({
      entrypoints: [options.entrypoint],
      loader: {".wgsl": "text"},
      target: "browser",
      sourcemap: "inline",
    })
    if (!result.success) {
      return new Response(result.logs.map((log) => String(log)).join("\n"), {
        status: 500,
        headers: {"content-type": "text/plain; charset=utf-8"},
      })
    }
    const nextAssets = new Map<string, Blob>()
    let entry: Blob | null = null
    for (const output of result.outputs) {
      const routePath = `/${basename(output.path)}`
      if (routePath === "/entry.js") entry = output
      else nextAssets.set(routePath, output)
    }
    buildAssets = nextAssets
    return entry === null
      ? new Response("entry.js was not emitted", {status: 500})
      : new Response(entry, {headers: {"content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache"}})
  }

  const indexResponse = (): Response => new Response(html, {
    headers: {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"},
  })

  return Bun.serve({
    hostname,
    port: options.port,
    development: {hmr: false},
    routes: {
      "/": indexResponse,
      "/style.css": () => new Response(Bun.file(options.stylePath), {headers: {"content-type": "text/css; charset=utf-8", "cache-control": "no-cache"}}),
      "/entry.js": buildEntry,
      "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(options.fontPath), {headers: {"content-type": "font/ttf"}}),
      "/:asset": {
        GET(request) {
          const asset = buildAssets.get(`/${request.params.asset}`)
          return asset === undefined ? indexResponse() : new Response(asset)
        },
      },
      "/*": indexResponse,
    },
  })
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
