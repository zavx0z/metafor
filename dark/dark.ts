import type { MetaAST } from "@metafor/ast"
import type { Address, MetaLoadTask } from "@dark/types/dark"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "@metafor/dsl/types"
import { gravity$, ingestFragment } from "@dark/gravity"
import { compileLocalTopologyFragment } from "@metafor/dsl/topology"
import { loadMetaAST, resolveMetaTsPath } from "./load"
import { dark$ } from "./store"

// //////////////////////////////////////////////////////////////////////////////
// matter
// //////////////////////////////////////////////////////////////////////////////

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
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    // получение мета
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    let ast = dark$.meta.get(next.metaAddress)
    if (!ast) {
      ast = await loadMetaAST(next.metaAddress)
      dark$.meta.set(next.metaAddress, structuredClone(ast))
    }
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    // получение фрагмента
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    let fragment = gravity$.fragments.get(next.metaAddress)
    if (!fragment) {
      fragment = compileLocalTopologyFragment(ast as LocalTopologyMetaLike)
      gravity$.fragments.set(next.metaAddress, fragment)
    }
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    // внедрение фрагмента
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    const ingested = ingestFragment(dark$, gravity$, next.metaAddress, fragment, {
      ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
      ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
    })
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    // постановка ссылок в очередь
    // — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —
    for (const referenceId of ingested.referenceIds) {
      const reference = dark$.getReference(referenceId)
      if (!reference) continue
      const refMetaAddress = reference.src as Address
      const existingRefMeta = dark$.meta.get(refMetaAddress)
      if (!existingRefMeta) {
        const refAst = await loadMetaAST(refMetaAddress)
        dark$.meta.set(refMetaAddress, structuredClone(refAst))
      }
      pending.push({
        metaAddress: refMetaAddress,
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })
    }
  }
}
