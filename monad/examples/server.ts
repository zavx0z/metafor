import { serve } from "bun"
import { join } from "path"

// Сервер для отдачи HTML и сборки клиента на лету
const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    // 1. Отдаем HTML страницу
    if (url.pathname === "/") {
      return new Response(
        `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Monad WebGPU Demo</title>
  <style>
    body { background: #111; color: #eee; font-family: monospace; padding: 20px; }
    h1 { color: #ad72f8; }
    pre { background: #222; padding: 15px; border-radius: 5px; border: 1px solid #444; }
    #status { font-weight: bold; margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>@metafor/monad</h1>
  <div id="status">Загрузка WebGPU...</div>
  <pre id="output"></pre>
  <script type="module" src="/client.js"></script>
</body>
</html>`,
        { headers: { "Content-Type": "text/html" } },
      )
    }

    // 2. Собираем и отдаем JS клиента (SSR Build)
    if (url.pathname === "/client.js") {
      const build = await Bun.build({
        entrypoints: [join(import.meta.dir, "client.ts")],
        target: "browser",
        loader: { ".wgsl": "text" }, // Поддержка импорта шейдеров
      })
      return new Response(build.outputs[0])
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`🚀 Сервер запущен: http://localhost:${server.port}`)
