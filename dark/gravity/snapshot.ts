import type { DarkGravityStoreSnapshot } from "@dark/types"
import type { LocalTopologyFragment } from "@metafor/dsl/types"

/**
 * Создаёт глубокую копию значения.
 *
 * @param value — значение для клонирования
 * @returns глубокая копия значения
 */
function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

/**
 * Создаёт глубокую копию Map с fragments.
 *
 * @param source — исходная Map с фрагментами
 * @returns новая Map с клонированными фрагментами
 */
function cloneFragments(source: ReadonlyMap<string, LocalTopologyFragment>): Map<string, LocalTopologyFragment> {
  return new Map(Array.from(source, ([key, value]) => [key, cloneValue(value)]))
}

/**
 * Создаёт глубокую копию снимка DarkGravityStore.
 *
 * @param snapshot — снимок для клонирования
 * @returns глубокая копия снимка
 */
export function cloneGravitySnapshot(snapshot: DarkGravityStoreSnapshot): DarkGravityStoreSnapshot {
  return {
    fragments: cloneFragments(snapshot.fragments),
    nextPlacementSeq: snapshot.nextPlacementSeq,
    nextLinkSeq: snapshot.nextLinkSeq,
    nextReferenceSeq: snapshot.nextReferenceSeq,
    rootOccurrenceSeq: snapshot.rootOccurrenceSeq,
  }
}

/**
 * Создаёт глубокую копию local topology fragment.
 *
 * @param fragment — фрагмент для клонирования
 * @returns глубокая копия фрагмента
 */
export function cloneFragment(fragment: LocalTopologyFragment): LocalTopologyFragment {
  return cloneValue(fragment)
}
