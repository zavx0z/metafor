import type { MetaAST } from "@metafor/ast"
import { loadMetaAST } from "./load"
import { dark$ } from "./store"
import { gravity$ } from "./gravity/store.ts"
import { strong$ } from "./strong/store.ts"
import type { Address } from "./dark.t"
import type { DarkStoreSnapshot } from "./store.t"
import { ingestFragment } from "./gravity/gravity.ts"
import { compileLocalTopologyFragment } from "../metafor/dsl/topology.ts"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "../metafor/dsl/topology.t.ts"
import { indexEntanglement, indexObject, indexPlacement, indexReference } from "./strong/strong.ts"

function getNextSequence(ids: Iterable<string>, prefix: string): number {
  let max = -1

  for (const id of ids) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) {
      max = value
    }
  }

  return max + 1
}

function getNextRootOccurrence(): number {
  let max = -1

  for (const placement of dark$.placements.values()) {
    const match = /^\/w:[^/]+-(\d+)(?:\/|$)/.exec(placement.address)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) {
      max = value
    }
  }

  return max + 1
}

function rebuildDerivedDarkState(): void {
  gravity$.reset()
  strong$.reset()

  for (const object of dark$.objects.values()) {
    indexObject(object.id, object.meta, strong$)
  }

  for (const placement of dark$.placements.values()) {
    indexPlacement(placement, placement.meta, strong$)
  }

  for (const reference of dark$.references.values()) {
    indexReference(reference, reference.meta, strong$)
  }

  for (const entanglement of dark$.entanglements.values()) {
    indexEntanglement(entanglement, entanglement.meta, strong$)
  }

  gravity$.nextPlacementSeq = getNextSequence(dark$.placements.keys(), "gp")
  gravity$.nextLinkSeq = getNextSequence(dark$.links.keys(), "gl")
  gravity$.nextReferenceSeq = getNextSequence(dark$.references.keys(), "gr")
  gravity$.rootOccurrenceSeq = getNextRootOccurrence()
}

export function resetDark(): void {
  dark$.reset()
  gravity$.reset()
  strong$.reset()
}

export function restoreDark(snapshot: DarkStoreSnapshot): void {
  dark$.restore(snapshot)
  rebuildDerivedDarkState()
}

export function snapshotDark(): DarkStoreSnapshot {
  return dark$.snapshot()
}

export function setMeta(address: Address, meta: MetaAST): MetaAST {
  return dark$.setMeta(address, meta)
}

export function getMeta(address: Address): MetaAST | undefined {
  return dark$.getMeta(address)
}

export async function matter(address: Address): Promise<void> {
  const ensureMetaLoaded = async (metaAddress: Address) => {
    const existing = getMeta(metaAddress)
    if (existing) return existing

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    setMeta(metaAddress, ast)
    return ast
  }

  const ensureLocalFragment = async (metaAddress: Address): Promise<LocalTopologyFragment> => {
    const existing = gravity$.getFragment(metaAddress)
    if (existing) return existing

    const ast = await ensureMetaLoaded(metaAddress)
    return gravity$.setFragment(metaAddress, compileLocalTopologyFragment(ast as LocalTopologyMetaLike))
  }

  const assembleHiddenTopology = async (rootAddress: Address): Promise<void> => {
    const pending: Array<{ metaAddress: Address; parentPlacementId?: string; viaReferenceId?: string }> = [
      { metaAddress: rootAddress },
    ]

    while (pending.length > 0) {
      const next = pending.shift()!
      const fragment = await ensureLocalFragment(next.metaAddress)
      const ingested = ingestFragment(next.metaAddress, fragment, {
        ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
        ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
      })

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
