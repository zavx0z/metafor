import { validateMatterAST, type MetaAST } from "@metafor/ast"
import type { SRC } from "@metafor/dsl"
import { Meta } from "@dark/strong"

const metaAstCache = new Map<SRC, MetaAST>()

/**
 * Преобразует SRC в путь к файлу для загрузки.
 *
 * @param address — канонический адрес хаба
 * @returns путь к файлу для fetch в формате `/{address}/meta.json`
 */
export function resolveMetaSource(address: SRC): string {
  return `/${address}/meta.json`
}

/**
 * Преобразует SRC в путь к исходному .ts файлу.
 *
 * @param address — канонический адрес хаба
 * @returns путь к .ts файлу в формате `/{address}.ts`
 */
export function resolveMetaTsPath(address: SRC): string {
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
export async function loadMetaAST(address: SRC): Promise<MetaAST> {
  const cached = metaAstCache.get(address)
  if (cached) return cached

  const sourcePath = resolveMetaSource(address)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    const ast = (await response.json()) as MetaAST
    validateMatterAST(ast.matter, ast.fields, ast.name)
    metaAstCache.set(address, ast)
    return ast
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить meta: ${resolveMetaTsPath(address)} — ${message}`)
  }
}

/**
 * Materialize-ит канонический `Meta` object model из AST.
 *
 * `matter` здесь намеренно не оседает в `Meta`: topology materialization остаётся задачей `Particles ORM`.
 */
export async function loadMeta(address: SRC): Promise<Meta> {
  const ast = await loadMetaAST(address)

  return new Meta({
    src: address,
    name: ast.name,
    fieldSchemas: ast.fields,
    superposition: ast.superposition,
    processes: ast.processes,
    reactions: ast.reactions,
    bulk: ast.bulk,
    mass: ast.mass && Object.keys(ast.mass).length > 0 ? structuredClone(ast.mass) : undefined,
  })
}
