import type {MetaDSL, SRC} from ".."
import {Meta} from "./strong"

const HUB = "github/"
let canonicalMetaContext:
  | {
      db: unknown
      loaded: Set<string>
    }
  | undefined

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

const resolveHubMetaSource = (address: SRC): string => resolveMetaSource(HUB + address)

const resolveLocalMetaModuleUrl = (address: SRC): string => new URL(`../${HUB}${address}/meta.ts`, import.meta.url).href

const loadMetaFromModule = async (address: SRC): Promise<MetaDSL> => {
  const module = await import(resolveLocalMetaModuleUrl(address))
  return structuredClone((module.default ?? module) as MetaDSL)
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
export async function loadMetaAST(address: SRC): Promise<MetaDSL> {
  if (typeof Bun !== "undefined") {
    try {
      return await loadMetaFromModule(address)
    } catch (error) {
      const sourcePath = resolveLocalMetaModuleUrl(address)
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Не удалось загрузить meta: ${sourcePath} — ${message}`)
    }
  }

  const sourcePath = resolveHubMetaSource(address)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return (await response.json()) as MetaDSL
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить meta: ${sourcePath} — ${message}`)
  }
}

/**
 * Загружает и канонизирует ровно одну meta в общем in-memory SQLite-контексте.
 *
 * Дальнейшая orchestration обхода дочерних meta должна жить выше `load`,
 * а не внутри этого модуля.
 */
export async function ensureMetaCanonicalized(address: SRC): Promise<{ db: unknown } | null> {
  if (typeof Bun === "undefined") return null

  if (!canonicalMetaContext) {
    const { getMetaDB } = await import("../pkg/sqlite/index.ts")
    canonicalMetaContext = {
      db: getMetaDB(":memory:"),
      loaded: new Set<string>(),
    }
  }

  if (!canonicalMetaContext.loaded.has(address)) {
    const { relation } = await import("../pkg/sqlite/index.ts")
    const ast = await loadMetaAST(address)
    relation(canonicalMetaContext.db as any, ast, address)
    canonicalMetaContext.loaded.add(address)
  }

  return { db: canonicalMetaContext.db }
}

export function resetCanonicalMetaContext(): void {
  const current = canonicalMetaContext
  canonicalMetaContext = undefined

  if (!current?.db || typeof current.db !== "object") return
  const close = (current.db as { close?: (throwOnError?: boolean) => void }).close
  if (typeof close === "function") close.call(current.db, false)
}

/**
 * Materialize-ит канонический `Meta` object model из AST.
 *
 * `Meta` хранит декларативный `matter` как часть meta-level source of truth,
 * а materialization topology-графа всё ещё остаётся задачей `Particles ORM`.
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
    matter: ast.matter,
    bulk: ast.bulk,
    mass: ast.mass && Object.keys(ast.mass).length > 0 ? structuredClone(ast.mass) : undefined,
  })
}
