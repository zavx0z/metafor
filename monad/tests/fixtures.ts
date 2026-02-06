import puppeteer from "puppeteer"
import { serve, build } from "bun"
import { join } from "path"
import { existsSync } from "node:fs"

export async function createHeadlessFixture() {
  const server = serve({
    development: true,
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      let path = url.pathname
      if (path === "/") path = "/index.html"
      if (path === "/favicon.ico") return new Response(null, { status: 204 })

      const buildResult = await build({
        entrypoints: [join(import.meta.dir, "../examples/index.html")],
        publicPath: "/",
        naming: "[name].[ext]",
        target: "browser",
        loader: { ".wgsl": "text" },
      })

      if (!buildResult.success) {
        return new Response(buildResult.logs.join("\n"), { status: 500 })
      }

      const artifact = buildResult.outputs.find((out) => out.path.endsWith(path))
      if (artifact) return new Response(artifact)
      return new Response("Not Found", { status: 404 })
    },
  })

  const HOST = `http://localhost:${server.port}`

  const getExecutablePath = () => {
    if (process.platform === "darwin") {
      const paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      ]
      for (const p of paths) {
        if (existsSync(p)) return p
      }
    }
    return undefined
  }

  // Настройка параметров запуска Puppeteer
  const launchOptions: any = {
    headless: true,
    args: ["--no-sandbox", "--enable-unsafe-webgpu", "--disable-vulkan-fallback-to-gl", "--disable-vulkan-surface"],
  }

  // Если найден локальный Chrome, используем его
  const execPath = getExecutablePath()
  if (execPath) {
    launchOptions.executablePath = execPath
  }

  const browser = await puppeteer.launch(launchOptions)

  const page = await browser.newPage()
  const logs: string[] = []

  page.on("console", (msg) => logs.push(msg.text()))
  page.on("pageerror", (err: any) => logs.push(`ERROR: ${err.message}`))

  return {
    server,
    browser,
    page,
    logs,
    url: HOST,
    cleanup: async () => {
      await browser.close()
      server.stop()
    },
  }
}
