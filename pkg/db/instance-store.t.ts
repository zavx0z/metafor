import type { DbFieldOrbitSnapshot, DbParticleShellSnapshot } from "./instance.t.ts"

/**
 * Канонический async-API instance-store: shell-carriers и field-orbits под одним `rootSrc`.
 *
 * Один и тот же контракт реализуют:
 * - `pkg/db/sqlite-instance-store.ts` — bun-sqlite + WAL для server/worker процессов;
 * - `pkg/db/idb-instance-store.ts` — IndexedDB для browser-side зеркала.
 *
 * Все методы async, чтобы не разделять call sites между sync (sqlite) и async (idb) кодом.
 *
 * **Concurrency**: single-writer pattern. Параллельные записи в один и тот же `rootSrc`
 * считаются ответственностью вызывающего; реализации не обязаны их сериализовать.
 */
export interface DbInstanceStore {
  /** Закрывает физические ресурсы (DB handle, IDBDatabase). После close все методы — no-op или throw. */
  close(): Promise<void>

  /** Удаляет все particles/fields под `rootSrc`. Не трогает другие rootSrc. */
  clearWorld(rootSrc: string): Promise<void>

  /** Вставляет один shell-carrier. Конфликт по `particleId` — ошибка. */
  insertParticleShell(rootSrc: string, shell: DbParticleShellSnapshot): Promise<void>

  /** Вставляет одну точку field-orbit. Конфликт по `id` — ошибка. */
  insertFieldOrbit(rootSrc: string, orbit: DbFieldOrbitSnapshot): Promise<void>

  /** Все particles под `rootSrc`, отсортированные `(depth, shellOrder, particleId)`. */
  selectAllParticleShells(rootSrc: string): Promise<DbParticleShellSnapshot[]>

  /** Все fields под `rootSrc`, отсортированные `(particleId, fieldOrder, id)`. */
  selectAllFieldOrbits(rootSrc: string): Promise<DbFieldOrbitSnapshot[]>

  /**
   * Прямые дети указанного родителя, отсортированные `(shellOrder, particleId)`.
   * `parentParticleId === null` — корневые particles.
   */
  selectParticleShellsByParent(
    rootSrc: string,
    parentParticleId: string | null,
  ): Promise<DbParticleShellSnapshot[]>

  /** Все fields конкретной частицы под `rootSrc`, отсортированные `(fieldOrder, id)`. */
  selectFieldOrbitsByParticle(rootSrc: string, particleId: string): Promise<DbFieldOrbitSnapshot[]>
}
