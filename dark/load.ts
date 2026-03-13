import type { MetaAST } from "@metafor/ast"

/**
 * Загружает MetaAST по hub-адресу.
 *
 * Хаб — это каноническая адресация meta-сущности вида `owner/path`, которая резолвится в `owner/path/meta.json`.
 *
 * Текущая реализация использует `fetch()` для загрузки по HTTP/HTTPS.
 * В будущем может включать git-кэш, OPFS и pinning по commit hash.
 *
 * @param hub Hub-адрес вида `owner/path`
 * @returns Распарсенный JSON или `undefined` при ошибке загрузки
 */
export async function loadMetaAST(hub: string): Promise<MetaAST | undefined> {
  const cleanPath = hub.trim().replace(/^\/+|\/+$/g, "")
  const url = `/${cleanPath}/meta.json`
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const json = await response.json()
    return json as MetaAST
  } catch (e) {
    console.error(e)
    return undefined
  }
}
