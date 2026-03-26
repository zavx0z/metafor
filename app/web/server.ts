import { serve } from "bun"
import { join, normalize } from "node:path"
import index from "./index.html"
const ROOT_DIRECTORY = normalize(join(import.meta.dir, "../../"))
const HUB_DIRECTORY = normalize(join(ROOT_DIRECTORY, "github"))

serve({
  port: 3000,
  development: {
    hmr: false,
    console: true,
  },
  routes: {
    "/": index,
    "/dark.js": new Response((await Bun.build({ entrypoints: ["../../dark/web.ts"] })).outputs[0], {
      headers: { "Content-Type": "application/javascript" },
    }),
    "/boundary.js": new Response((await Bun.build({ entrypoints: ["../../boundary/web.ts"] })).outputs[0], {
      headers: { "Content-Type": "application/javascript" },
    }),
    "/github/*": async (req) => {
      try {
        const path = new URL(req.url).pathname
        return new Response(Bun.file(join(ROOT_DIRECTORY, path)))
      } catch (e) {
        console.error(e)
        return new Response("Not Found", { status: 404 })
      }
    },
  },
  async fetch(request) {
    const pathname = new URL(request.url).pathname
    for (const filePath of resolveStaticFilePaths(pathname)) {
      const file = Bun.file(filePath)
      if (await file.exists()) return new Response(file)
    }
    return new Response("Not Found", { status: 404 })
  },
})

console.log("Сервер запущен: http://localhost:3000")

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
