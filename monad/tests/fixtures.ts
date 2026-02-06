import puppeteer from "puppeteer"
import { serve } from "bun"
import index from "../examples/index.html"
import { existsSync } from "node:fs"

export async function createHeadlessFixture() {
  const server = serve({
    port: 0,
    development: {
      hmr: true,
      console: true,
    },
    routes: {
      "/": index,
    },
    async fetch(req) {
      const url = new URL(req.url)
      let path = url.pathname
      return new Response("Not Found " + path, { status: 404 })
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
  if (execPath) launchOptions.executablePath = execPath

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
