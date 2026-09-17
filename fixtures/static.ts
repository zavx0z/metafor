import { basename, dirname, join } from "path"
import { existsSync, readdirSync, statSync } from "fs"

export function createNotFoundResponse(pathname: string): Response {
  const notFoundHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 - Страница не найдена</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        h1 { color: #333; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <h1>404 - Страница не найдена</h1>
      <p>Извините, запрошенная страница не существует.</p>
      <p>Путь: ${pathname}</p>
      <a href="/">Вернуться на главную</a>
    </body>
    </html>
  `
  return new Response(notFoundHTML, {
    status: 404,
    headers: { "Content-Type": "text/html" },
  })
}

export async function serveStaticFile(path: string): Promise<Response> {
  const resolvedPath = resolveFilePath(path)
  if (!resolvedPath) return createNotFoundResponse(path)
  return new Response(Bun.file(resolvedPath), { headers: { "Content-Type": getMimeType(resolvedPath) } })
}

export function getMimeType(pathname: string): string {
  if (pathname.endsWith(".css")) return "text/css"
  if (pathname.endsWith(".js")) return "application/javascript"
  if (pathname.endsWith(".js.map")) return "application/json"
  if (pathname.endsWith(".html")) return "text/html"
  if (pathname.endsWith(".png")) return "image/png"
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
  if (pathname.endsWith(".gif")) return "image/gif"
  if (pathname.endsWith(".svg")) return "image/svg+xml"
  if (pathname.endsWith(".wasm")) return "application/wasm"
  return "application/octet-stream"
}

const resolveFilePath = (requestedPath: string): string | null => {
  // Проверка, если файл с хешем уже указан в запросе
  if (existsSync(requestedPath) && !statSync(requestedPath).isDirectory()) {
    return requestedPath // файл существует, возвращаем его
  }

  // Проверка, является ли запрашиваемый путь директорией
  if (existsSync(requestedPath) && statSync(requestedPath).isDirectory()) {
    requestedPath = join(requestedPath, "index.js")
  }

  // Проверка наличия файла с хешем в имени, если не найден точный файл
  const dir = dirname(requestedPath)
  const baseName = basename(requestedPath, ".js")
  try {
    const files = readdirSync(dir)
    // Регулярное выражение для поиска файлов с хешем
    const regex = new RegExp(`^${baseName}.*\\.js$`)

    for (const file of files) {
      if (regex.test(file)) {
        return join(dir, file) // файл с хешем найден, возвращаем его
      }
    }
  } catch (e: any) {
    console.error(`[static server] Не найден файл: ${requestedPath} \n ${e.stack}`)
  }

  return null // файл не найден
}
