/**
 * Test-only fixtures для @dark.
 *
 * Эти функции предназначены только для тестов и не должны
 * экспортироваться из production API домена.
 */

import type { DarkStoreSnapshot, DarkGravityStoreSnapshot, StrongIndexesSnapshot } from "@dark/types"
import { dark$ } from "../../store.ts"
import { gravity$ } from "../../gravity/store.ts"
import { strong$ } from "../../strong/store.ts"

/**
 * Сбрасывает dark$ в начальное состояние.
 */
export function resetDark(): void {
  dark$.meta.clear()
  dark$.objects.clear()
  dark$.placements.clear()
  dark$.links.clear()
  dark$.references.clear()
  dark$.entanglements.clear()

  gravity$.fragments.clear()
  gravity$.nextPlacementSeq = 0
  gravity$.nextLinkSeq = 0
  gravity$.nextReferenceSeq = 0
  gravity$.nextEntanglementSeq = 0
  gravity$.rootOccurrenceSeq = 0

  strong$.placementAddressIndex.clear()
  strong$.entanglementAddressIndex.clear()
  strong$.objectPlacementsIndex.clear()
  strong$.sourceMetaIndex.clear()
  strong$.metaSourceLookup.clear()
}

/**
 * Восстанавливает dark$ из снимка.
 */
export function restoreDark(snapshot: DarkStoreSnapshot): void {
  dark$.meta.clear()
  dark$.objects.clear()
  dark$.placements.clear()
  dark$.links.clear()
  dark$.references.clear()
  dark$.entanglements.clear()

  for (const [key, value] of snapshot.meta) dark$.meta.set(key, value)
  for (const [key, value] of snapshot.objects) dark$.objects.set(key, value)
  for (const [key, value] of snapshot.placements) dark$.placements.set(key, value)
  for (const [key, value] of snapshot.links) dark$.links.set(key, value)
  for (const [key, value] of snapshot.references) dark$.references.set(key, value)
  for (const [key, value] of snapshot.entanglements) dark$.entanglements.set(key, value)

  // Пересобираем индексы strong$ и gravity$
  rebuildDerivedDarkState()
}

/**
 * Перестраивает производное состояние (strong$ и gravity$ индексы).
 */
function rebuildDerivedDarkState(): void {
  gravity$.fragments.clear()
  gravity$.nextPlacementSeq = 0
  gravity$.nextLinkSeq = 0
  gravity$.nextReferenceSeq = 0
  gravity$.nextEntanglementSeq = 0
  gravity$.rootOccurrenceSeq = 0

  strong$.placementAddressIndex.clear()
  strong$.entanglementAddressIndex.clear()
  strong$.objectPlacementsIndex.clear()
  strong$.sourceMetaIndex.clear()
  strong$.metaSourceLookup.clear()

  // Импортируем rebuildStrongIndexes для пересборки индексов
  // Используем динамический импорт для избежания циклической зависимости
  const { rebuildStrongIndexes } = require("../../strong/strong.ts")
  rebuildStrongIndexes(dark$)

  // Восстанавливаем счётчики на основе restored данных
  const getNextSequence = (ids: Iterable<string>, prefix: string): number => {
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

  const getNextRootOccurrence = (): number => {
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

  gravity$.nextPlacementSeq = getNextSequence(dark$.placements.keys(), "gp")
  gravity$.nextLinkSeq = getNextSequence(dark$.links.keys(), "gl")
  gravity$.nextReferenceSeq = getNextSequence(dark$.references.keys(), "gr")
  gravity$.nextEntanglementSeq = getNextSequence(dark$.entanglements.keys(), "ge")
  gravity$.rootOccurrenceSeq = getNextRootOccurrence()
}

/**
 * Сбрасывает gravity$ в начальное состояние.
 */
export function resetGravity(): void {
  gravity$.fragments.clear()
  gravity$.nextPlacementSeq = 0
  gravity$.nextLinkSeq = 0
  gravity$.nextReferenceSeq = 0
  gravity$.nextEntanglementSeq = 0
  gravity$.rootOccurrenceSeq = 0
}

/**
 * Создаёт снимок gravity$.
 */
export function snapshotGravity(): DarkGravityStoreSnapshot {
  return structuredClone({
    fragments: gravity$.fragments,
    nextPlacementSeq: gravity$.nextPlacementSeq,
    nextLinkSeq: gravity$.nextLinkSeq,
    nextReferenceSeq: gravity$.nextReferenceSeq,
    nextEntanglementSeq: gravity$.nextEntanglementSeq,
    rootOccurrenceSeq: gravity$.rootOccurrenceSeq,
  })
}

/**
 * Восстанавливает gravity$ из снимка.
 */
export function restoreGravity(snapshot: ReturnType<typeof snapshotGravity>): void {
  gravity$.fragments.clear()
  for (const [key, value] of snapshot.fragments) {
    gravity$.fragments.set(key, value)
  }
  gravity$.nextPlacementSeq = snapshot.nextPlacementSeq
  gravity$.nextLinkSeq = snapshot.nextLinkSeq
  gravity$.nextReferenceSeq = snapshot.nextReferenceSeq
  gravity$.nextEntanglementSeq = snapshot.nextEntanglementSeq
  gravity$.rootOccurrenceSeq = snapshot.rootOccurrenceSeq
}

/**
 * Сбрасывает strong$ в начальное состояние.
 */
export function resetStrong(): void {
  strong$.placementAddressIndex.clear()
  strong$.entanglementAddressIndex.clear()
  strong$.objectPlacementsIndex.clear()
  strong$.sourceMetaIndex.clear()
  strong$.metaSourceLookup.clear()
}

/**
 * Создаёт снимок strong$.
 */
export function snapshotStrong(): StrongIndexesSnapshot {
  return structuredClone({
    placementAddressIndex: strong$.placementAddressIndex,
    entanglementAddressIndex: strong$.entanglementAddressIndex,
    objectPlacementsIndex: strong$.objectPlacementsIndex,
    sourceMetaIndex: strong$.sourceMetaIndex,
    metaSourceLookup: strong$.metaSourceLookup,
  })
}

/**
 * Восстанавливает strong$ из снимка.
 */
export function restoreStrong(snapshot: ReturnType<typeof snapshotStrong>): void {
  strong$.placementAddressIndex.clear()
  strong$.entanglementAddressIndex.clear()
  strong$.objectPlacementsIndex.clear()
  strong$.sourceMetaIndex.clear()
  strong$.metaSourceLookup.clear()

  for (const [key, value] of snapshot.placementAddressIndex) {
    strong$.placementAddressIndex.set(key, value)
  }
  for (const [key, value] of snapshot.entanglementAddressIndex) {
    strong$.entanglementAddressIndex.set(key, value)
  }
  for (const [key, value] of snapshot.objectPlacementsIndex) {
    strong$.objectPlacementsIndex.set(key, value)
  }
  for (const [key, value] of snapshot.sourceMetaIndex) {
    strong$.sourceMetaIndex.set(key, value)
  }
  for (const [key, value] of snapshot.metaSourceLookup) {
    strong$.metaSourceLookup.set(key, value)
  }
}

/**
 * Сбрасывает все store домена.
 */
export function resetAll(): void {
  resetDark()
  resetGravity()
  resetStrong()
}
