import type { DarkStoreSnapshot } from "./store.t.ts"

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function cloneMapValues<T>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map(Array.from(source, ([key, value]) => [key, cloneValue(value)]))
}

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

export function cloneStoredValue<T>(value: T): T {
  return cloneValue(value)
}
