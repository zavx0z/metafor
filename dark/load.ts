import type { MetaAST } from "@metafor/ast"
import type { Address } from "./dark.t"

/**
 * Загружает MetaAST из файла.
 *
 * Не делает orchestration пакета Dark и не мутирует store.
 *
 * @returns `ast` или `undefined` при ошибке загрузки
 */
export async function loadMetaAST(address: Address): Promise<MetaAST | undefined> {
  const sourcePath = resolveMetaSource(address)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return (await response.json()) as MetaAST
  } catch (error) {
    console.error(error)
    return undefined
  }
}

/**
 * Преобразует Address в путь к файлу для загрузки.
 *
 * @param address - канонический адрес хаба
 * @returns путь к файлу для fetch
 */
function resolveMetaSource(address: Address): string {
  return `/${address}/meta.json`
}
