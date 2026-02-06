import puppeteer from "puppeteer"
import { serve } from "bun"
import { join } from "path"

// Автономный Headless Runner
;(async () => {
  // --- 1. Встроенный сервер ---
  const server = serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      let path = url.pathname
      if (path === "/") path = "/index.html"
      if (path === "/favicon.ico") return new Response(null, { status: 204 })

      const build = await Bun.build({
        entrypoints: [join(import.meta.dir, "index.html")],
        publicPath: "/",
        naming: "[name].[ext]",
        target: "browser",
        loader: { ".wgsl": "text" },
      })

      if (!build.success) {
        return new Response(build.logs.join("\n"), { status: 500 })
      }

      const artifact = build.outputs.find((out) => out.path.endsWith(path))
      if (artifact) return new Response(artifact)

      return new Response("Not Found", { status: 404 })
    },
  })

  const HOST = `http://localhost:${server.port}`
  console.log(`🚀 Внутренний сервер запущен: ${HOST}`)

  // --- 2. Поиск Chrome ---
  const getExecutablePath = () => {
    if (process.platform === "darwin") {
      const paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      ]
      for (const p of paths) {
        // @ts-ignore
        if (typeof Bun !== "undefined" && Bun.file(p).size > 0) return p
        try {
          if (require("fs").existsSync(p)) return p
        } catch (e) {}
      }
    }
    return undefined
  }

  // --- 3. Запуск Puppeteer ---
  try {
    console.log("🔧 Запуск Headless Chrome...")
    const execPath = getExecutablePath()
    const launchOptions: any = {
      headless: true,
      args: ["--no-sandbox", "--enable-unsafe-webgpu", "--disable-vulkan-fallback-to-gl", "--disable-vulkan-surface"],
    }
    if (execPath) {
      launchOptions.executablePath = execPath
    }

    const browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()

    page.on("console", (msg) => {
      console.log(`[BROWSER] ${msg.text()}`)
    })

    page.on("pageerror", (err) => {
      console.error(`[BROWSER ERROR]`, err)
    })

    await page.goto(HOST, { waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 3000))

    await browser.close()
    server.stop()
    console.log("✅ Тест завершен успешно.")
  } catch (err) {
    server.stop()
    console.error("❌ Критическая ошибка:", err)
    process.exit(1)
  }
})()