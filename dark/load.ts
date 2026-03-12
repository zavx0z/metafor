import type { MetaAST } from "@metafor/ast"

/**
 * Загружает MetaAST из `meta.json` в Web-среде.
 *
 * Использует `fetch()` для загрузки по HTTP/HTTPS.
 *
 * @param metaPath Базовый URL к директории с `meta.json`
 * @returns Распарсенный JSON или `undefined` при ошибке загрузки
 */
export async function loadMetaAST(metaPath: string): Promise<MetaAST | undefined> {
  const cleanPath = metaPath.trim().replace(/^\/+|\/+$/g, "")
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
