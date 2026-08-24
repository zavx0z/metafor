import {basename} from "node:path"

export type PlaygroundServerOptions = Readonly<{
  packageName: string
  port: number
  entrypoint: string
  stylePath: string
  fontPath: string
  hostname?: string
  staticFiles?: Readonly<Record<string, string>>
  canvasId?: string
}>

export type PlaygroundPageBody =
  | Readonly<{kind: "canvas"; canvasId: string}>
  | Readonly<{kind: "html"; bodyHtmlPath: string}>

export type PlaygroundPageOptions = Readonly<{
  id: string
  mountPath: string
  packageName: string
  entrypoint: string
  stylePath: string
  body: PlaygroundPageBody
  deepRoutes?: boolean
}>

export type PlaygroundPageDiagnostics = Readonly<{
  builds: number
}>

export type PlaygroundPage = Readonly<{
  id: string
  mountPath: string
  deepRoutes: boolean
  assetBasePath: string
  readonly diagnostics: PlaygroundPageDiagnostics
  matches(pathname: string): boolean
  htmlResponse(): Promise<Response>
  assetResponse(pathname: string): Promise<Response | null>
}>

export type PlaygroundHubServerOptions = Readonly<{
  pages: readonly PlaygroundPage[]
  port: number
  hostname?: string
  staticFiles?: Readonly<Record<string, string>>
}>

export function startPlaygroundServer(options: PlaygroundServerOptions): ReturnType<typeof Bun.serve> {
  const hostname = options.hostname ?? "127.0.0.1"
  const canvasId = options.canvasId ?? "playground-canvas"
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <base href="/">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="cache-control" content="no-cache">
    <title>${escapeHtml(options.packageName)}</title>
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <canvas id="${escapeHtml(canvasId)}"></canvas>
    <script type="module" src="/entry.js"></script>
  </body>
</html>`
  let buildAssets = new Map<string, Blob>()
  const staticRoutes = Object.fromEntries(Object.entries(options.staticFiles ?? {}).map(([route, path]) => [
    route,
    () => new Response(Bun.file(path), {headers: {"cache-control": "no-cache"}}),
  ]))

  const buildEntry = async (): Promise<Response> => {
    const result = await Bun.build({
      entrypoints: [options.entrypoint],
      loader: {".wgsl": "text"},
      target: "browser",
      format: "esm",
      splitting: true,
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
      if (output.kind === "entry-point") entry = output
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
      ...staticRoutes,
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

/** Creates one mountable no-HMR page without opening a listener. */
export function createPlaygroundPage(options: PlaygroundPageOptions): PlaygroundPage {
  const id = validatePageId(options.id)
  const mountPath = normalizeMountPath(options.mountPath)
  const deepRoutes = options.deepRoutes ?? true
  const assetBasePath = `/@playground-assets/${id}`
  const html = createPageHtml(options, mountPath, assetBasePath)
  let builds = 0
  let built: BuiltPageAssets | null = null
  let buildInFlight: Promise<BuiltPageAssets> | null = null

  const ensureBuilt = (): Promise<BuiltPageAssets> => {
    if (built !== null) return Promise.resolve(built)
    if (buildInFlight !== null) return buildInFlight
    builds += 1
    const pending = buildPageAssets(options.entrypoint)
      .then((next) => {
        built = next
        return next
      })
      .finally(() => {
        if (buildInFlight === pending) buildInFlight = null
      })
    buildInFlight = pending
    return pending
  }

  return Object.freeze({
    id,
    mountPath,
    deepRoutes,
    assetBasePath,
    get diagnostics(): PlaygroundPageDiagnostics {
      return Object.freeze({builds})
    },
    matches(pathname: string): boolean {
      if (pathname === mountPath) return true
      if (!deepRoutes) return false
      return mountPath === "/" ? pathname.startsWith("/") : pathname.startsWith(`${mountPath}/`)
    },
    async htmlResponse(): Promise<Response> {
      return new Response(await html, {
        headers: {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"},
      })
    },
    async assetResponse(pathname: string): Promise<Response | null> {
      if (!pathname.startsWith(`${assetBasePath}/`)) return null
      const assetName = pathname.slice(assetBasePath.length + 1)
      if (assetName.length === 0 || assetName.includes("/")) return notFound()
      if (assetName === "style.css") {
        return new Response(Bun.file(options.stylePath), {
          headers: {"content-type": "text/css; charset=utf-8", "cache-control": "no-cache"},
        })
      }
      let assets: BuiltPageAssets
      try {
        assets = await ensureBuilt()
      } catch (error) {
        return new Response(errorText(error), {
          status: 500,
          headers: {"content-type": "text/plain; charset=utf-8", "cache-control": "no-cache"},
        })
      }
      if (assetName === "entry.js") {
        return new Response(assets.entry, {
          headers: {"content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache"},
        })
      }
      const asset = assets.files.get(assetName)
      if (asset === undefined) return notFound()
      const headers: Record<string, string> = {"cache-control": "no-cache"}
      const contentType = buildAssetContentType(assetName, asset)
      if (contentType !== null) headers["content-type"] = contentType
      return new Response(asset, {headers})
    },
  })
}

/** Starts one origin that dispatches independent package pages and shared static files. */
export function startPlaygroundHubServer(options: PlaygroundHubServerOptions): ReturnType<typeof Bun.serve> {
  const hostname = options.hostname ?? "127.0.0.1"
  const pages = validateHubPages(options.pages)
  const staticFiles = new Map(Object.entries(options.staticFiles ?? {}).map(([route, path]) => [
    normalizeStaticRoute(route),
    path,
  ]))
  for (const route of staticFiles.keys()) {
    if (route.startsWith("/@playground-assets/")) {
      throw new Error(`Shared static route overlaps playground assets: ${route}`)
    }
  }

  return Bun.serve({
    hostname,
    port: options.port,
    development: {hmr: false},
    async fetch(request) {
      const pathname = new URL(request.url).pathname
      const staticPath = staticFiles.get(pathname)
      if (staticPath !== undefined) {
        return new Response(Bun.file(staticPath), {headers: {"cache-control": "no-cache"}})
      }
      if (pathname.startsWith("/@playground-assets/")) {
        for (const page of pages) {
          const response = await page.assetResponse(pathname)
          if (response !== null) return response
        }
        return notFound()
      }
      const page = pages.find((candidate) => candidate.matches(pathname))
      return page === undefined ? notFound() : page.htmlResponse()
    },
  })
}

type BuiltPageAssets = Readonly<{
  entry: Blob
  files: ReadonlyMap<string, Blob>
}>

async function buildPageAssets(entrypoint: string): Promise<BuiltPageAssets> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    loader: {".wgsl": "text"},
    target: "browser",
    format: "esm",
    splitting: true,
    sourcemap: "inline",
  })
  if (!result.success) throw new Error(result.logs.map((log) => String(log)).join("\n"))
  let entry: Blob | null = null
  const files = new Map<string, Blob>()
  for (const output of result.outputs) {
    const name = basename(output.path)
    if (output.kind === "entry-point") {
      if (entry !== null) throw new Error("Playground page emitted more than one entrypoint")
      entry = output
      continue
    }
    if (files.has(name)) throw new Error(`Playground page emitted duplicate asset name: ${name}`)
    files.set(name, output)
  }
  if (entry === null) throw new Error("Playground page entrypoint was not emitted")
  return Object.freeze({entry, files})
}

function createPageHtml(
  options: PlaygroundPageOptions,
  mountPath: string,
  assetBasePath: string,
): Promise<string> {
  const body = options.body.kind === "canvas"
    ? Promise.resolve(`<canvas id="${escapeHtml(options.body.canvasId)}"></canvas>`)
    : Bun.file(options.body.bodyHtmlPath).text()
  const baseHref = mountPath === "/" ? "/" : `${mountPath}/`
  return body.then((bodyHtml) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <base href="${escapeHtml(baseHref)}">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="cache-control" content="no-cache">
    <title>${escapeHtml(options.packageName)}</title>
    <link rel="stylesheet" href="${assetBasePath}/style.css">
  </head>
  <body>
    ${bodyHtml}
    <script type="module" src="${assetBasePath}/entry.js"></script>
  </body>
</html>`)
}

function validateHubPages(input: readonly PlaygroundPage[]): readonly PlaygroundPage[] {
  if (input.length === 0) throw new Error("Playground hub requires at least one page")
  const ids = new Set<string>()
  const mounts = new Set<string>()
  for (const page of input) {
    if (ids.has(page.id)) throw new Error(`Duplicate playground page id: ${page.id}`)
    if (mounts.has(page.mountPath)) throw new Error(`Duplicate playground mount: ${page.mountPath}`)
    ids.add(page.id)
    mounts.add(page.mountPath)
  }
  return Object.freeze([...input].sort((left, right) => right.mountPath.length - left.mountPath.length))
}

function validatePageId(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Playground page id must be kebab-case: ${value}`)
  }
  return value
}

function normalizeMountPath(value: string): string {
  if (value === "/") return value
  if (!value.startsWith("/") || value.endsWith("/") || value.includes("//") || /[?#*]/.test(value)) {
    throw new Error(`Playground mount must be a normalized absolute pathname: ${value}`)
  }
  return value
}

function normalizeStaticRoute(value: string): string {
  if (!value.startsWith("/") || value.length < 2 || /[?#*]/.test(value)) {
    throw new Error(`Playground static route must be an absolute pathname: ${value}`)
  }
  return value
}

function buildAssetContentType(name: string, asset: Blob): string | null {
  if (asset.type.length > 0) return asset.type
  if (name.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (name.endsWith(".css")) return "text/css; charset=utf-8"
  if (name.endsWith(".json") || name.endsWith(".map")) return "application/json; charset=utf-8"
  return null
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {"content-type": "text/plain; charset=utf-8", "cache-control": "no-cache"},
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
