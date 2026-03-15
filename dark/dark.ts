import type { MetaAST } from "@metafor/ast"
import type { Address, MetaLoadTask } from "@dark/types/dark"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "@metafor/dsl/types"
import { gravity$, ingestFragment } from "@dark/gravity"
import { strong$ } from "@dark/strong"
import { compileLocalTopologyFragment } from "@metafor/dsl/topology"
import { loadMetaAST, resolveMetaTsPath } from "./load"
import { dark$ } from "./store"

/**
 * Гарантирует загрузку meta-схемы.
 *
 * @param metaAddress — адрес meta-схемы
 * @returns загруженная или существующая meta-схема
 */
async function ensureMetaLoaded(metaAddress: Address): Promise<MetaAST> {
  const existing = dark$.getMeta(metaAddress)
  if (existing) return existing

  const ast = await loadMetaAST(metaAddress)
  if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
  dark$.setMeta(metaAddress, ast)
  return ast
}

/**
 * Гарантирует наличие local topology fragment.
 *
 * @param metaAddress — адрес meta-схемы
 * @returns скомпилированный фрагмент топологии
 */
async function ensureLocalFragment(metaAddress: Address): Promise<LocalTopologyFragment> {
  const existing = gravity$.getFragment(metaAddress)
  if (existing) return existing

  const ast = await ensureMetaLoaded(metaAddress)
  const sourcePath = resolveMetaTsPath(metaAddress)
  try {
    return gravity$.setFragment(metaAddress, compileLocalTopologyFragment(ast as LocalTopologyMetaLike))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Ошибка компиляции topology для "${sourcePath}": ${message}`)
  }
}

/**
 * Загружает meta-схему по адресу и собирает скрытую топологию.
 *
 * Рекурсивно загружает все зависимые meta-схемы через references
 * и собирает полный граф placements, references и entanglements.
 *
 * @param address — канонический адрес хаба для загрузки
 */
export async function matter(address: Address): Promise<void> {
  const pending: MetaLoadTask[] = [{ metaAddress: address }]

  while (pending.length > 0) {
    const next = pending.shift()!
    const fragment = await ensureLocalFragment(next.metaAddress)
    const ingested = ingestFragment(
      dark$,
      gravity$,
      strong$,
      next.metaAddress,
      fragment,
      {
        ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
        ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
      },
    )

    for (const referenceId of ingested.referenceIds) {
      const reference = dark$.getReference(referenceId)
      if (!reference) continue
      await ensureMetaLoaded(reference.src as Address)
      pending.push({
        metaAddress: reference.src as Address,
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })
    }
  }
}
