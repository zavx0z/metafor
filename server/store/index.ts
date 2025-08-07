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
    UNIQUE (meta, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_actor_meta ON actor (meta);
CREATE INDEX IF NOT EXISTS idx_actor_parent ON actor (parent_id);
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

const getActorByMetaQuery = `
SELECT * FROM actor WHERE meta = ?;
`

const getActorByIdQuery = `
SELECT * FROM actor WHERE id = ?;
`

const getNextIndexQuery = `
SELECT COALESCE(MAX(idx), -1) + 1 as next_index 
FROM actor 
WHERE meta = ? AND parent_id IS ?;
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
    // Проверяем, существует ли уже актор с такой метой
    const existingActor = this.#db.prepare(getActorByMetaQuery).as(SQLiteActorStore).get(data.meta)

    if (existingActor) {
      return existingActor
    }

    // Создаем нового актора
    const result = this.#db.prepare(createActorQuery).run(data.meta, data.parent_id, data.idx, data.snapshot)

    const actorId = Number(result.lastInsertRowid)

    // Получаем созданного актора
    const actor = this.#db.prepare("SELECT * FROM actor WHERE id = ?").as(SQLiteActorStore).get(actorId)

    if (!actor) {
      throw new Error("Failed to create actor")
    }

    return actor
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
