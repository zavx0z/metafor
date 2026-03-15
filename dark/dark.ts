import type { MetaAST } from "@metafor/ast"
import type { Address } from "@dark/types/dark"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "@metafor/dsl/types"
import { gravity$, ingestFragment } from "@dark/gravity"
import { strong$ } from "@dark/strong"
import { compileLocalTopologyFragment } from "@metafor/dsl/topology"
import { loadMetaAST, resolveMetaTsPath } from "./load"
import { dark$ } from "./store"

/**
 * Сохраняет meta-схему по адресу в dark store.
 *
 * @param address — канонический адрес хаба
 * @param meta — meta-схема AST
 * @returns сохранённая meta-схема
 */
export function setMeta(address: Address, meta: MetaAST): MetaAST {
  return dark$.setMeta(address, meta)
}

/**
 * Получает meta-схему по адресу из dark store.
 *
 * @param address — канонический адрес хаба
 * @returns meta-схема или undefined
 */
export function getMeta(address: Address): MetaAST | undefined {
  return dark$.getMeta(address)
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
  /**
   * Гарантирует загрузку meta-схемы.
   *
   * @param metaAddress — адрес meta-схемы
   * @returns загруженная или существующая meta-схема
   */
  const ensureMetaLoaded = async (metaAddress: Address) => {
    const existing = getMeta(metaAddress)
    if (existing) return existing

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    setMeta(metaAddress, ast)
    return ast
  }

  /**
   * Гарантирует наличие local topology fragment.
   *
   * @param metaAddress — адрес meta-схемы
   * @returns скомпилированный фрагмент топологии
   */
  const ensureLocalFragment = async (metaAddress: Address): Promise<LocalTopologyFragment> => {
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
   * Собирает скрытую топологию из root адреса.
   *
   * Рекурсивно обходит все references и загружает зависимые meta-схемы.
   *
   * @param rootAddress — адрес корневой meta-схемы
   */
  const assembleHiddenTopology = async (rootAddress: Address): Promise<void> => {
    const pending: Array<{ metaAddress: Address; parentPlacementId?: string; viaReferenceId?: string }> = [
      { metaAddress: rootAddress },
    ]

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

  await ensureMetaLoaded(address)
  await assembleHiddenTopology(address)
}
