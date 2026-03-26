import { serve } from "bun"
import { join, normalize } from "node:path"

const ROOT_DIRECTORY = normalize(join(import.meta.dir, "../../"))
const APP_WEB_DIRECTORY = normalize(import.meta.dir)
const HUB_DIRECTORY = normalize(join(ROOT_DIRECTORY, "github"))
const INDEX_HTML_PATH = join(APP_WEB_DIRECTORY, "index.html")
const BROWSER_ENTRY_BY_PATH = {
  "/client.js": join(APP_WEB_DIRECTORY, "client.ts"),
  "/boundary/web.ts": join(ROOT_DIRECTORY, "boundary/web.ts"),
  "/dark/web.ts": join(ROOT_DIRECTORY, "dark/web.ts"),
} as const

const browserEntrySourceByPath = new Map<string, Promise<string>>()

const buildBrowserEntry = async (entrypoint: string): Promise<string> => {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    format: "esm",
    minify: false,
    sourcemap: "none",
    splitting: false,
    target: "browser",
  })

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join("\n") || `Failed to bundle ${entrypoint}`)
  }

  const output = result.outputs.find((item) => item.path.endsWith(".js"))
  if (!output) {
    throw new Error(`Bundled output missing JavaScript asset for ${entrypoint}`)
  }

  return await output.text()
}

const readBrowserEntrySource = (pathname: keyof typeof BROWSER_ENTRY_BY_PATH): Promise<string> => {
  const cached = browserEntrySourceByPath.get(pathname)
  if (cached) return cached

  const next = buildBrowserEntry(BROWSER_ENTRY_BY_PATH[pathname])
  browserEntrySourceByPath.set(pathname, next)
  return next
}

const serveBrowserEntry = async (pathname: keyof typeof BROWSER_ENTRY_BY_PATH): Promise<Response> => {
  try {
    return new Response(await readBrowserEntrySource(pathname), {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    console.error(error)
    return new Response("Build Failed", { status: 500 })
  }
}

const isInside = (root: string, path: string): boolean => path !== root && path.startsWith(root)

const resolveStaticFilePaths = (pathname: string): string[] => {
  const candidates: string[] = []

  if (pathname.endsWith(".json") && !pathname.startsWith("/github/")) {
    const hubPath = normalize(join(HUB_DIRECTORY, pathname))
    if (isInside(HUB_DIRECTORY, hubPath)) candidates.push(hubPath)
  }

  const rootPath = normalize(join(ROOT_DIRECTORY, pathname))
  if (isInside(ROOT_DIRECTORY, rootPath)) candidates.push(rootPath)

  return candidates
}

const serveStaticFile = async (pathname: string): Promise<Response> => {
  for (const filePath of resolveStaticFilePaths(pathname)) {
    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }
  }

  return new Response("Not Found", { status: 404 })
}

serve({
  port: 3000,
  development: {
    hmr: false,
    console: true,
  },
  async fetch(request) {
    const pathname = new URL(request.url).pathname

    if (pathname === "/") {
      return new Response(Bun.file(INDEX_HTML_PATH), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      })
    }

    if (pathname in BROWSER_ENTRY_BY_PATH) {
      return serveBrowserEntry(pathname as keyof typeof BROWSER_ENTRY_BY_PATH)
    }

    return serveStaticFile(pathname)
  },
})

console.log("Сервер запущен: http://localhost:3000")
