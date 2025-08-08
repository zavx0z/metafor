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
        snapshot TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES actor (id) ON DELETE CASCADE,
    FOREIGN KEY (meta) REFERENCES meta (meta) ON DELETE CASCADE,
    UNIQUE (meta, parent_id, idx)
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
INSERT INTO actor (meta, parent_id, idx, snapshot)
VALUES (?, ?, ?, ?);
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

const getActorByCompositeWithNullParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id IS NULL AND idx = ?;
`

const getActorByCompositeWithParentQuery = `
SELECT * FROM actor WHERE meta = ? AND parent_id = ? AND idx = ?;
`

class SQLiteActorStore implements ActorStore {
  id: number = 0
  meta: string = ""
  parent_id: number | null = null
  idx: number = 0
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
    // Пытаемся найти существующего актора по (meta, parent_id, idx)
    let existingActor: SQLiteActorStore | null = null
    if (data.idx !== undefined && data.idx !== null) {
      if (data.parent_id == null) {
        existingActor =
          this.#db.prepare(getActorByCompositeWithNullParentQuery).as(SQLiteActorStore).get(data.meta, data.idx) || null
      } else {
        existingActor =
          this.#db
            .prepare(getActorByCompositeWithParentQuery)
            .as(SQLiteActorStore)
            .get(data.meta, data.parent_id, data.idx) || null
      }
    }

    if (existingActor) {
      // Если запись уже существует по (meta, parent_id, idx), не перезаписываем snapshot здесь,
      // чтобы сохранить последнее актуальное состояние (ре-гидратация).
      return existingActor
    }

    // Если актора нет, рассчитываем idx при необходимости
    let idx = data.idx
    if (idx == null || Number.isNaN(idx)) {
      const res = this.#db.prepare(getNextIndexQuery).get(data.meta, data.parent_id) as { next_index: number }
      idx = res?.next_index ?? 0
    }

    // Создаем нового актора
    const result = this.#db.prepare(createActorQuery).run(data.meta, data.parent_id, idx, data.snapshot)

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
}
