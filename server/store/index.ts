import { Database } from "bun:sqlite"
import type { ActorStore } from "../../core/store/index.t"
import type { Store } from "../../core/store/index.t"
import type { MetaRecord } from "../../core/store/index.t"

// SQL-запросы для создания таблиц
const createTablesQuery = `
CREATE TABLE IF NOT EXISTS meta (
    meta TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS actor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
    meta TEXT NOT NULL,
        parent_id INTEGER,
        idx INTEGER NOT NULL,
        key TEXT,
        snapshot TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES actor (id) ON DELETE CASCADE,
    FOREIGN KEY (meta) REFERENCES meta (meta) ON DELETE CASCADE
    -- Убрано уникальное ограничение на (meta,parent_id,idx) для поддержки атомарных перестановок
);

CREATE INDEX IF NOT EXISTS idx_actor_meta ON actor (meta);
CREATE INDEX IF NOT EXISTS idx_actor_parent ON actor (parent_id);
CREATE INDEX IF NOT EXISTS idx_actor_meta_parent_idx ON actor (meta, parent_id, idx);
`

// SQL-запросы для работы с meta
const setMetaQuery = `
INSERT INTO meta (meta, fingerprint) 
VALUES (?, ?)
ON CONFLICT(meta) DO UPDATE SET 
  fingerprint = excluded.fingerprint,
  timestamp = CURRENT_TIMESTAMP;
`

const getMetaQuery = `
SELECT * FROM meta WHERE meta = ?;
`

// SQL-запросы для работы с акторами
const createActorQuery = `
INSERT INTO actor (meta, parent_id, idx, key, snapshot)
VALUES (?, ?, ?, ?, ?);
`

const getActorByMetaAndParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id = ?;
`

const getActorByMetaAndParentNullQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id IS NULL;
`

const getActorByIdQuery = `
SELECT * FROM actor WHERE id = ?;
`

const getNextIndexQuery = `
SELECT COALESCE(MAX(idx), -1) + 1 as next_index 
FROM actor 
WHERE meta = ? AND parent_id IS ?;
`

const updateActorSnapshotQuery = `
UPDATE actor SET snapshot = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?;
`

const updateActorLocationQuery = `
UPDATE actor SET parent_id = ?, idx = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?;
`

const updateActorKeyQuery = `
UPDATE actor SET key = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?;
`

const getActorByCompositeWithNullParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id IS NULL AND idx = ? ORDER BY id DESC LIMIT 1;
`

const getActorByCompositeWithParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id = ? AND idx = ? ORDER BY id DESC LIMIT 1;
`

const getActorByKeyAnyParentQuery = `
SELECT * FROM actor WHERE meta = ? AND key = ? ORDER BY id DESC LIMIT 1;
`

const getActorByKeyWithParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id IS ? AND key = ? ORDER BY id DESC LIMIT 1;
`

const getActorByMetaIdxAnyParentQuery = `
SELECT * FROM actor WHERE meta = ? AND idx = ? ORDER BY id DESC LIMIT 1;
`

class SQLiteActorStore implements ActorStore {
  id: number = 0
  meta: string = ""
  parent_id: number | null = null
  idx: number = 0
  key: string | null = null
  snapshot: string = ""
  timestamp: string = ""
}

export { SQLiteActorStore }

const hasher = new Bun.CryptoHasher("md5")

export class SQLiteStore implements Store {
  #db: Database

  constructor(path: string = "store.sqlite") {
    this.#db = new Database(path, { create: true, strict: true })

    // Включаем проверку внешних ключей
    this.#db.run("PRAGMA foreign_keys = ON;")

    // Включаем WAL режим для лучшей производительности
    this.#db.run("PRAGMA journal_mode = WAL;")

    // Создаем таблицы
    const statements = createTablesQuery
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const statement of statements) {
      try {
        this.#db.run(statement)
      } catch (error) {
        console.error("Error executing SQL statement:", statement)
        console.error(error)
        throw error
      }
    }
  }

  /**
   * Сохраняет мета-запись, если она не существует, и возвращает хеш
   */
  saveMetaIsNotExists(fingerprint: string): string {
    const hash = hasher.update(fingerprint).digest("hex")

    // Проверяем, существует ли уже мета-запись с таким хешем
    const existingMeta = this.#db.prepare(getMetaQuery).get(hash) as MetaRecord | null

    if (!existingMeta) {
      // Создаем новую мета-запись
      this.#db.prepare(setMetaQuery).run(hash, fingerprint)
    }

    return hash
  }

  /**
   * Получает мета-запись по хешу
   */
  getMeta(meta: string): MetaRecord | null {
    return this.#db.prepare(getMetaQuery).get(meta) as MetaRecord | null
  }

  /**
   * Сохраняет актора, если он не существует, и возвращает его
   */
  saveActorIsNotExist(data: Omit<ActorStore, "id" | "timestamp">): ActorStore {
    // Рассчитываем индекс заранее при необходимости
    let idx = data.idx
    if (idx == null || Number.isNaN(idx)) {
      const res = this.#db.prepare(getNextIndexQuery).get(data.meta, data.parent_id) as { next_index: number }
      idx = res?.next_index ?? 0
    }
    // 1) Если есть стабильный ключ, пробуем найти по нему независимо от parent_id
    if ((data as any).key) {
      const byKey = this.#db
        .prepare(getActorByKeyAnyParentQuery)
        .as(SQLiteActorStore)
        .get(data.meta, (data as any).key)
      if (byKey) {
        // Обновляем локацию на актуальную и возвращаем запись
        this.updateActorLocation((byKey as any).id, data.parent_id ?? null, idx)
        const updated = this.#db
          .prepare(getActorByIdQuery)
          .as(SQLiteActorStore)
          .get((byKey as any).id)
        return (updated as SQLiteActorStore) || (byKey as SQLiteActorStore)
      }
    }

    // 2) Пытаемся найти существующего актора по (meta, parent_id, idx)
    if (idx !== undefined && idx !== null) {
      const existingActor: SQLiteActorStore | null =
        data.parent_id == null
          ? this.#db.prepare(getActorByCompositeWithNullParentQuery).as(SQLiteActorStore).get(data.meta, idx) || null
          : this.#db
              .prepare(getActorByCompositeWithParentQuery)
              .as(SQLiteActorStore)
              .get(data.meta, data.parent_id, idx) || null
      if (existingActor) {
        return existingActor
      }
    }

    // 3) Фолбэк: ищем запись по meta+idx без учета родителя и переносим её под нового родителя
    const byMetaIdx = this.#db.prepare(getActorByMetaIdxAnyParentQuery).as(SQLiteActorStore).get(data.meta, idx)
    if (byMetaIdx) {
      this.updateActorLocation((byMetaIdx as any).id, data.parent_id ?? null, idx)
      const updated = this.#db
        .prepare(getActorByIdQuery)
        .as(SQLiteActorStore)
        .get((byMetaIdx as any).id)
      return (updated as SQLiteActorStore) || (byMetaIdx as SQLiteActorStore)
    }

    // Создаем нового актора
    const result = this.#db
      .prepare(createActorQuery)
      .run(data.meta, data.parent_id, idx, (data as any).key ?? null, data.snapshot)

    const actorId = Number(result.lastInsertRowid)

    // Получаем созданного актора
    const actor = this.#db.prepare(getActorByIdQuery).as(SQLiteActorStore).get(actorId)

    if (!actor) {
      throw new Error("Failed to create actor")
    }

    return actor
  }

  /** Возвращает последнего созданного актора по meta (для вычисления parent_id) */
  getActorByMeta(meta: string): ActorStore | null {
    const row = this.#db
      .prepare("SELECT * FROM actor WHERE meta = ? ORDER BY id DESC LIMIT 1")
      .as(SQLiteActorStore)
      .get(meta)
    return (row as SQLiteActorStore) || null
  }

  /** Обновляет snapshot существующего актора по id */
  updateActorSnapshot(id: number, snapshot: string): void {
    this.#db.prepare(updateActorSnapshotQuery).run(snapshot, id)
  }

  /** Получает актора по составному ключу (meta, parent_id, idx) без модификации */
  getActorByComposite(meta: string, parent_id: number | null, idx: number): ActorStore | null {
    const row =
      parent_id == null
        ? this.#db.prepare(getActorByCompositeWithNullParentQuery).as(SQLiteActorStore).get(meta, idx)
        : this.#db.prepare(getActorByCompositeWithParentQuery).as(SQLiteActorStore).get(meta, parent_id, idx)
    return (row as SQLiteActorStore) || null
  }

  getActorByKey(meta: string, parent_id: number | null, key: string): ActorStore | null {
    const row = this.#db.prepare(getActorByKeyWithParentQuery).as(SQLiteActorStore).get(meta, parent_id, key)
    return (row as SQLiteActorStore) || null
  }

  getActorByKeyAnyParent(meta: string, key: string): ActorStore | null {
    const row = this.#db.prepare(getActorByKeyAnyParentQuery).as(SQLiteActorStore).get(meta, key)
    return (row as SQLiteActorStore) || null
  }

  /** Обновляет расположение актора (parent_id, idx) без изменения snapshot */
  updateActorLocation(id: number, parent_id: number | null, idx: number): void {
    this.#db.prepare(updateActorLocationQuery).run(parent_id, idx, id)
  }

  /**
   * Получает всех акторов (для отладки и веб-сокетов)
   */
  getAllActors(): SQLiteActorStore[] {
    return this.#db.prepare("SELECT * FROM actor").as(SQLiteActorStore).all()
  }

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    this.#db.close()
  }

  updateActorKey(id: number, key: string): void {
    this.#db.prepare(updateActorKeyQuery).run(key, id)
  }
}
