import type { Database } from "bun:sqlite"
import type { DbInstanceStore } from "./instance-store.t.ts"
import {
  clearDbWorld,
  insertDbFieldOrbit,
  insertDbParticleShell,
  openDbInstanceSqlite,
  selectAllFieldOrbits,
  selectAllParticleShells,
  selectFieldOrbitsByParticle,
  selectParticleShellsByParent,
} from "./instance.ts"

export interface SqliteDbInstanceStoreOptions {
  /** Путь к SQLite-файлу. `:memory:` или undefined → in-memory. */
  filename?: string
  /** Уже открытый Database handle. Если указан — не закрывается на `close()`. */
  database?: Database
}

/**
 * Bun-sqlite реализация {@link DbInstanceStore}.
 *
 * Открывает (или принимает извне) `Database` через {@link openDbInstanceSqlite},
 * что включает WAL и `busy_timeout` для file-backed DB. Все sync-операции bun-sqlite
 * оборачиваются в `Promise.resolve()` чтобы соответствовать контракту.
 */
export const createSqliteDbInstanceStore = (
  options: SqliteDbInstanceStoreOptions = {},
): DbInstanceStore => {
  const owned = options.database === undefined
  const db = options.database ?? openDbInstanceSqlite({ filename: options.filename ?? ":memory:" })

  return {
    async close() {
      if (owned) {
        try {
          db.close()
        } catch {
          // ignore double-close
        }
      }
    },
    async clearWorld(rootSrc) {
      clearDbWorld(db, rootSrc)
    },
    async insertParticleShell(rootSrc, shell) {
      insertDbParticleShell(db, rootSrc, shell)
    },
    async insertFieldOrbit(rootSrc, orbit) {
      insertDbFieldOrbit(db, rootSrc, orbit)
    },
    async selectAllParticleShells(rootSrc) {
      return selectAllParticleShells(db, rootSrc)
    },
    async selectAllFieldOrbits(rootSrc) {
      return selectAllFieldOrbits(db, rootSrc)
    },
    async selectParticleShellsByParent(rootSrc, parentParticleId) {
      return selectParticleShellsByParent(db, rootSrc, parentParticleId)
    },
    async selectFieldOrbitsByParticle(rootSrc, particleId) {
      return selectFieldOrbitsByParticle(db, rootSrc, particleId)
    },
  }
}
