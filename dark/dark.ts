import { loadMetaAST } from "./load"
import { dark$ } from "./store"
import type { Address } from "./dark.t"
import { compileLocalTopologyFragment } from "../metafor/dsl/topology.ts"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "../metafor/dsl/topology.t.ts"

export async function matter(address: Address): Promise<void> {
  const ensureMetaLoaded = async (metaAddress: Address) => {
    const existing = dark$.getMeta(metaAddress)
    if (existing) return existing

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    dark$.setMeta(metaAddress, ast)
    return ast
  }

  const ensureLocalFragment = async (metaAddress: Address): Promise<LocalTopologyFragment> => {
    const existing = dark$.topology.getFragment(metaAddress)
    if (existing) return existing

    const ast = await ensureMetaLoaded(metaAddress)
    return dark$.topology.setFragment(metaAddress, compileLocalTopologyFragment(ast as LocalTopologyMetaLike))
  }

  const assembleHiddenTopology = async (rootAddress: Address): Promise<void> => {
    const pending: Array<{ metaAddress: Address; parentPlacementId?: string; viaReferenceId?: string }> = [
      { metaAddress: rootAddress },
    ]

    while (pending.length > 0) {
      const next = pending.shift()!
      const fragment = await ensureLocalFragment(next.metaAddress)
      const ingested = dark$.topology.ingestFragment(next.metaAddress, fragment, {
        ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
        ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
      })

      for (const referenceId of ingested.referenceIds) {
        const reference = dark$.topology.getReference(referenceId)
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
