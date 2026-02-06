import { serve } from "bun"
import { join } from "path"

// Сервер для отдачи Fullstack приложения (HTML + Client)
const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname
    if (path === "/") path = "/index.html"

    // Используем HTML как точку входа. Bun автоматически соберет подключенный <script src="./client.ts">
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, "index.html")],
      publicPath: "/",
      naming: "[name].[ext]", // Сохраняем имена файлов плоскими (index.html, client.js)
      target: "browser",
      loader: { ".wgsl": "text" },
    })

    if (!build.success) {
      return new Response(build.logs.join("\n"), { status: 500 })
    }

    // Ищем запрошенный файл среди артефактов сборки
    const artifact = build.outputs.find((out) => out.path.endsWith(path))
    
    if (artifact) {
      return new Response(artifact)
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`🚀 Сервер запущен: http://localhost:${server.port}`)