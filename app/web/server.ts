import { serve } from "bun"
import index from "./index.html"
import { join } from "node:path"

const ROOT_DIRECTORY = join(import.meta.dir, "../../")
const BROWSER_ENTRY_BY_PATH = {
  "/boundary/web.ts": join(ROOT_DIRECTORY, "boundary/web.ts"),
  "/dark/web.ts": join(ROOT_DIRECTORY, "dark/web.ts"),
} as const
const browserEntrySourceByEntrypoint = new Map<string, Promise<string>>()

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

const readBrowserEntrySource = (entrypoint: string): Promise<string> => {
  const cached = browserEntrySourceByEntrypoint.get(entrypoint)
  if (cached) return cached

  const next = buildBrowserEntry(entrypoint)
  browserEntrySourceByEntrypoint.set(entrypoint, next)
  return next
}

const serveBrowserEntry = (entrypoint: string) => async (): Promise<Response> => {
  try {
    return new Response(await readBrowserEntrySource(entrypoint), {
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

const server = serve({
  port: 3000,
  development: {
    hmr: false,
    console: true,
  },
  routes: {
    "/": index,
    "/boundary/web.ts": serveBrowserEntry(BROWSER_ENTRY_BY_PATH["/boundary/web.ts"]),
    "/dark/web.ts": serveBrowserEntry(BROWSER_ENTRY_BY_PATH["/dark/web.ts"]),
  },
})

console.log(`Сервер запущен: http://localhost:${server.port}`)
