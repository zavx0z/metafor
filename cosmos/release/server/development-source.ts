import createWorkspace from "@zavx0z/ai-workspace"
import listFiles from "@zavx0z/ai-filesystem-list"
import readFile from "@zavx0z/ai-filesystem-read"
import writeFile from "@zavx0z/ai-filesystem-write"
import ToolError from "@zavx0z/ai-tech-failure"
import {extname} from "node:path"
import type {createDevelopmentCatalog} from "./development-catalog"

/**
Ручной редактор использует те же файловые инструменты, что и назначенный агент.
Каталог определяет package root и право записи, AI workspace проверяет пути и
identity. Полный UTF-8 файл читается с hash; сохранение требует этот hash и
не повторяется после конфликта. См. development-source.spec.ts.
*/
export function createDevelopmentSources(catalog: Pick<Awaited<ReturnType<typeof createDevelopmentCatalog>>, "source">) {
  const workspaces = new Map<string, ReturnType<typeof createWorkspace>>()
  const assigned = (name: string) => {
    const source = catalog.source(name)
    let workspace = workspaces.get(name)
    if (!workspace) {
      workspace = createWorkspace({directory: source.directory})
      workspaces.set(name, workspace)
    }
    if (workspace.directory() !== source.directory) throw new ToolError("ROOT_NOT_ALLOWED", "Назначение исходников изменилось", 403)
    return {source, workspace}
  }
  return {
    resource(packageName: string, path: string) {
      const {workspace} = assigned(packageName)
      const types: Readonly<Record<string, string>> = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml"}
      const type = types[extname(path).toLowerCase()]
      if (!type) throw new ToolError("INVALID_PATH_TYPE", "Документ может открыть только принадлежащее пакету изображение")
      const result = readFile({path, encoding: "base64", maxBytes: 8_388_608}, workspace)
      if (result.truncated || result.contentHash === null) throw new ToolError("LIMIT_EXCEEDED", "Ресурс документа превышает 8 МиБ", 413)
      return new Response(Buffer.from(result.content, "base64"), {headers: {"content-type": type, "cache-control": "no-store",
        "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", etag: `"${result.contentHash}"`}})
    },
    async list(packageName: string, path = ".") {
      const {workspace} = assigned(packageName)
      const result = listFiles({path, recursive: false, maxEntries: 1000}, workspace)
      return {entries: result.entries.flatMap(entry => entry.type === "file" || entry.type === "directory"
        ? [{path: entry.path, type: entry.type}] : []), truncated: result.truncated}
    },
    async read(packageName: string, path: string) {
      const {source, workspace} = assigned(packageName)
      const result = readFile({path, encoding: "base64", maxBytes: 1_048_576}, workspace)
      if (result.truncated || result.contentHash === null) throw new ToolError("LIMIT_EXCEEDED", "Редактор открывает файлы до 1 МиБ", 413)
      let content: string
      try {content = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(Buffer.from(result.content, "base64"))}
      catch {throw new ToolError("INVALID_PATH_TYPE", "Редактор открывает текстовые файлы UTF-8")}
      if (content.includes("\0")) throw new ToolError("INVALID_PATH_TYPE", "Этот файл содержит двоичные данные")
      return {path: result.path, content, hash: result.contentHash, writable: source.writable}
    },
    async save(packageName: string, path: string, content: string, expectedHash: string) {
      const {source, workspace} = assigned(packageName)
      if (!source.writable) throw new ToolError("PATH_NOT_ALLOWED", "Пакету не назначена запись исходников", 403)
      if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new ToolError("INVALID_INPUT", "Для сохранения нужен hash открытого файла")
      if (typeof content !== "string" || Buffer.byteLength(content) > 1_048_576 || content.includes("\0")) throw new ToolError("INVALID_INPUT", "Для сохранения нужен текст UTF-8 до 1 МиБ")
      const result = writeFile({path, content, expectedHash}, workspace)
      return {path: result.path, hash: result.contentHash}
    },
  }
}
