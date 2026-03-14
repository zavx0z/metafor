import type { DarkStoreSnapshot } from "@dark/types"

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
 * Создаёт глубокую копию Map со значениями.
 *
 * @param source — исходная Map
 * @returns новая Map с клонированными значениями
 */
function cloneMapValues<T>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(Array.from(source, ([key, value]) => [key, cloneValue(value)]))
}

/**
 * Создаёт глубокую копию снимка DarkStore.
 *
 * @param snapshot — снимок для клонирования
 * @returns глубокая копия снимка
 */
export function cloneDarkSnapshot(snapshot: DarkStoreSnapshot): DarkStoreSnapshot {
  return {
    meta: cloneMapValues(snapshot.meta),
    objects: cloneMapValues(snapshot.objects),
    placements: cloneMapValues(snapshot.placements),
    links: cloneMapValues(snapshot.links),
    references: cloneMapValues(snapshot.references),
    entanglements: cloneMapValues(snapshot.entanglements),
  }
}

/**
 * Создаёт глубокую копию stored value.
 *
 * @param value — значение для клонирования
 * @returns глубокая копия значения
 */
export function cloneStoredValue<T>(value: T): T {
  return cloneValue(value)
}
