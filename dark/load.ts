import type { MetaAST } from "@metafor/ast"
import type { Address } from "@dark/types/dark"

/**
 * Преобразует Address в путь к файлу для загрузки.
 *
 * @param address — канонический адрес хаба
 * @returns путь к файлу для fetch в формате `/{address}/meta.json`
 */
export function resolveMetaSource(address: Address): string {
  return `/${address}/meta.json`
}

/**
 * Преобразует Address в путь к исходному .ts файлу.
 *
 * @param address — канонический адрес хаба
 * @returns путь к .ts файлу в формате `/{address}.ts`
 */
export function resolveMetaTsPath(address: Address): string {
  return `/${address}.ts`
}

/**
 * Загружает MetaAST из файла.
 *
 * Не делает orchestration пакета Dark и не мутирует store.
 *
 * @param address — канонический адрес хаба для загрузки
 * @returns `ast`
 * @throws если не удалось загрузить meta
 */
export async function loadMetaAST(address: Address): Promise<MetaAST> {
  const sourcePath = resolveMetaSource(address)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return (await response.json()) as MetaAST
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить meta: ${resolveMetaTsPath(address)} — ${message}`)
  }
}
