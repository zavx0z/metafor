import {basename} from "node:path"
import {
  resolvePlaygroundRouteTree,
  type PlaygroundRouteTree,
} from "./route-tree.ts"

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
  homePath?: string
  deepRoutes?: boolean
  routeTree?: PlaygroundRouteTree<string>
}>

export type PlaygroundPageDiagnostics = Readonly<{
  builds: number
}>

export type PlaygroundPage = Readonly<{
  id: string
  mountPath: string
  deepRoutes: boolean
  routeTree: PlaygroundRouteTree<string> | null
  assetBasePath: string
  readonly diagnostics: PlaygroundPageDiagnostics
  owns(pathname: string): boolean
  matches(pathname: string): boolean
  routeResponse(pathname: string): Promise<Response | null>
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
    <link rel="icon" href="data:,">
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
  const homePath = options.homePath === undefined ? null : normalizeHomePath(options.homePath)
  if (options.routeTree !== undefined && options.deepRoutes !== undefined) {
    throw new Error("Playground page routeTree cannot be combined with deepRoutes")
  }
  const deepRoutes = options.deepRoutes ?? true
  const routeTree = options.routeTree ?? null
  const assetBasePath = `/@playground-assets/${id}`
  const html = createPageHtml(options, mountPath, assetBasePath, homePath)
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
  const htmlResponse = async (): Promise<Response> => new Response(await html, {
    headers: {"content-type": "text/html; charset=utf-8", "cache-control": "no-cache"},
  })

  return Object.freeze({
    id,
    mountPath,
    deepRoutes,
    routeTree,
    assetBasePath,
    get diagnostics(): PlaygroundPageDiagnostics {
      return Object.freeze({builds})
    },
    owns(pathname: string): boolean {
      return ownsMountPath(pathname, mountPath)
    },
    matches(pathname: string): boolean {
      if (!ownsMountPath(pathname, mountPath)) return false
      if (routeTree !== null) {
        return resolvePlaygroundRouteTree(routeTree, {pathname}, {basePath: mountPath}).kind === "match"
      }
      if (pathname === mountPath) return true
      if (!deepRoutes) return false
      return mountPath === "/" ? pathname.startsWith("/") : pathname.startsWith(`${mountPath}/`)
    },
    async routeResponse(pathname: string): Promise<Response | null> {
      if (!ownsMountPath(pathname, mountPath)) return null
      if (routeTree !== null) {
        const resolution = resolvePlaygroundRouteTree(routeTree, {pathname}, {basePath: mountPath})
        if (resolution.kind === "not-found") return notFound()
        if (resolution.redirect) {
          return new Response(null, {
            status: 308,
            headers: {location: resolution.canonicalPath, "cache-control": "no-cache"},
          })
        }
        return htmlResponse()
      }
      const legacyMatch = pathname === mountPath || (deepRoutes &&
        (mountPath === "/" ? pathname.startsWith("/") : pathname.startsWith(`${mountPath}/`)))
      return legacyMatch ? htmlResponse() : notFound()
    },
    htmlResponse,
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
      const page = pages.find((candidate) => candidate.owns(pathname))
      if (page === undefined) return notFound()
      return await page.routeResponse(pathname) ?? notFound()
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
  homePath: string | null,
): Promise<string> {
  const body = options.body.kind === "canvas"
    ? Promise.resolve(`<canvas id="${escapeHtml(options.body.canvasId)}"></canvas>`)
    : Bun.file(options.body.bodyHtmlPath).text()
  const baseHref = mountPath === "/" ? "/" : `${mountPath}/`
  const home = homePath === null
    ? ""
    : `<a class="playground-home" data-playground-home href="${escapeHtml(homePath)}" aria-label="На главную playground">Home</a>`
  return body.then((bodyHtml) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <base href="${escapeHtml(baseHref)}">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="cache-control" content="no-cache">
    <link rel="icon" href="data:,">
    <title>${escapeHtml(options.packageName)}</title>
    <link rel="stylesheet" href="${assetBasePath}/style.css">
    <style>
      .playground-home {
        position: fixed;
        left: 10px;
        bottom: 10px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 3px;
        background: rgba(35, 35, 35, 0.94);
        color: rgba(255, 255, 255, 0.9);
        font: 600 12px/1 monospace;
        letter-spacing: 0.02em;
        text-decoration: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      .playground-home:hover,
      .playground-home:focus-visible {
        border-color: rgba(96, 165, 250, 0.9);
        outline: 1px solid rgba(96, 165, 250, 0.65);
      }
    </style>
  </head>
  <body>
    ${home}
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

function normalizeHomePath(value: string): string {
  if (!value.startsWith("/") || value.includes("//") || /[?#*]/.test(value)) {
    throw new Error(`Playground home path must be an absolute pathname: ${value}`)
  }
  return value.length > 1 ? value.replace(/\/+$/g, "") : value
}

function ownsMountPath(pathname: string, mountPath: string): boolean {
  if (!pathname.startsWith("/")) return false
  if (mountPath === "/") return true
  return pathname === mountPath || pathname.startsWith(`${mountPath}/`)
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
