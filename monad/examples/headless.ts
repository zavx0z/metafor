import puppeteer from "puppeteer"
import { serve } from "bun"
import { join } from "path"

// Автономный Headless Runner
// 1. Поднимает локальный сервер Bun
// 2. Запускает Headless Chrome
// 3. Выполняет симуляцию WebGPU
;(async () => {
  // --- 1. Встроенный сервер ---
  const server = serve({
    port: 0, // Случайный свободный порт
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/") {
        return new Response(
          `
<!DOCTYPE html>
<html>
<head><title>Headless Host</title></head>
<body>
  <div id="status">Init...</div>
  <pre id="output"></pre>
  <script type="module" src="/client.js"></script>
</body>
</html>`,
          { headers: { "Content-Type": "text/html" } },
        )
      }

      if (url.pathname === "/client.js") {
        const build = await Bun.build({
          entrypoints: [join(import.meta.dir, "client.ts")],
          target: "browser",
        })
        return new Response(build.outputs[0])
      }

      if (url.pathname === "/favicon.ico") {
        return new Response(null, { status: 204 })
      }

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

    // Проброс консоли браузера в терминал
    page.on("console", (msg) => {
      const text = msg.text()
      // Фильтруем системный шум, если нужно
      console.log(`[BROWSER] ${text}`)
    })

    // Обработка ошибок страницы
    page.on("pageerror", (err) => {
      console.error(`[BROWSER ERROR]`, err)
    })

    await page.goto(HOST, { waitUntil: "networkidle0" })

    // Ждем выполнения (в client.ts логгируется результат)
    // Даем 3 секунды на инициализацию и расчет шейдеров
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
