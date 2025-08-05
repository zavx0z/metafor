import { Database } from "bun:sqlite"
import type { PatchRecord, TransactionCallback, ActorTreeNode } from "./index.t"
import type { MetaRecord } from "../../core/store/index.t"
import type { Store } from "../../core/store/index.t"
import type { Message } from "../../core/message"
import type { ActorStore } from "../../core/store/index.t"

// SQL-запросы для создания таблиц
const createTablesQuery = `
CREATE TABLE
    IF NOT EXISTS meta (
        tag TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    IF NOT EXISTS actor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meta_tag TEXT NOT NULL,
        parent_id INTEGER,
        idx INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES actor (id) ON DELETE CASCADE,
        FOREIGN KEY (meta_tag) REFERENCES meta (tag) ON DELETE CASCADE,
        UNIQUE (meta_tag, parent_id)
    );

CREATE TABLE
    IF NOT EXISTS patch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER NOT NULL,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        value TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (actor_id) REFERENCES actor (id) ON DELETE CASCADE
    );

-- Создаем индексы для ускорения поиска
CREATE INDEX IF NOT EXISTS idx_actor_tag ON actor (meta_tag);

CREATE INDEX IF NOT EXISTS idx_actor_parent ON actor (parent_id);

CREATE INDEX IF NOT EXISTS idx_patch_actor ON patch (actor_id);
`

// SQL-запросы для работы с meta
const setMetaQuery = `
INSERT INTO meta (tag, fingerprint) 
VALUES (?, ?)
ON CONFLICT(tag) DO UPDATE SET 
  fingerprint = excluded.fingerprint,
  timestamp = CURRENT_TIMESTAMP;
`

const getMetaQuery = `
SELECT * FROM meta WHERE tag = ?;
`

const deleteMetaQuery = `
DELETE FROM meta WHERE tag = ?;
`

// SQL-запросы для работы с акторами
const createActorQuery = `
INSERT INTO actor (meta_tag, parent_id, idx, snapshot)
VALUES (?, ?, ?, ?);
`

const updateActorSnapshotQuery = `
UPDATE actor 
SET snapshot = ?, timestamp = CURRENT_TIMESTAMP
WHERE id = ?;
`

const getChildActorsQuery = `
SELECT * FROM actor WHERE parent_id = ? ORDER BY idx;
`

const deleteActorQuery = `
DELETE FROM actor WHERE id = ?;
`

// SQL-запросы для работы с патчами
const addPatchQuery = `
INSERT INTO patch (actor_id, op, path, value)
VALUES (?, ?, ?, ?);
`

const getPatchesByActorQuery = `
SELECT * FROM patch WHERE actor_id = ? ORDER BY id;
`

const getPatchQuery = `
SELECT * FROM patch WHERE id = ?;
`

const deletePatchQuery = `
DELETE FROM patch WHERE id = ?;
`

// SQL-запросы для бэкапа
const getTablesQuery = `
SELECT name, sql FROM sqlite_master 
WHERE type='table' AND name NOT LIKE 'sqlite_%'
`

const getOtherObjectsQuery = `
SELECT sql FROM sqlite_master 
WHERE type IN ('index', 'view', 'trigger') AND sql IS NOT NULL
`
class SQLiteActorStore implements ActorStore {
  id: number = 0
  meta_tag: string = ""
  parent_id: number | null = null
  idx: number = 0
  snapshot: string = ""
  timestamp: string = ""
}
export { SQLiteActorStore }

const hasher = new Bun.CryptoHasher("md5")

export class SQLiteStore implements Store {
  #db: Database

  saveMetaIsNotExists(fingerprint: string) {
    const hash = hasher.update(fingerprint).digest("hex")
    const meta = this.getMeta(hash)
    if (meta) return hash
    this.setMeta({ tag: hash, fingerprint })
    return hash
  }

  /**
   * Получает актора по ID
   */
  saveActorIsNotExist(data: Omit<ActorStore, "id" | "timestamp">): ActorStore {
    const result = this.#db
      .prepare(`SELECT * FROM actor WHERE meta_tag = $meta_tag`)
      .as(SQLiteActorStore)
      .get({ meta_tag: data.meta_tag })
    if (!result) {
      const actorId = this.createActor(data)
      const actor = this.getActorById(actorId)
      if (!actor) throw new Error("Actor not found")
      return actor
    }
    return result
  }
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

    // Выполняем каждый SQL-запрос отдельно
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
   * Выполняет операции в транзакции
   */
  #transaction(callback: TransactionCallback) {
    const commit = this.#db.transaction(() => {
      callback(this.#db)
    })

    try {
      commit()
    } catch (error) {
      console.error("Transaction failed:", error)
      throw error
    }
  }

  // ===== Методы для работы с Meta =====

  /**
   * Создает или обновляет запись в таблице meta
   */
  setMeta(meta: Omit<MetaRecord, "timestamp">): void {
    // Используем явную транзакцию для гарантии фиксации
    const stmt = this.#db.prepare(setMetaQuery)
    try {
      this.#db.transaction(() => {
        stmt.run(meta.tag, meta.fingerprint)
      })()
    } catch (error) {
      console.error("Error in setMeta transaction:", error)
      throw error
    }
  }

  /**
   * Получает запись из таблицы meta по тегу
   */
  getMeta(tag: string): MetaRecord | null {
    return this.#db.prepare(getMetaQuery).get(tag) as MetaRecord | null
  }

  /**
   * Удаляет запись из таблицы meta по тегу
   * (каскадно удалит связанные записи из actor и patch)
   */
  deleteMeta(tag: string): void {
    this.#db.prepare(deleteMetaQuery).run(tag)
  }

  // ===== Методы для работы с Actor =====

  /**
   * Создает нового актора
   */
  createActor(actor: Omit<SQLiteActorStore, "id" | "timestamp">): number {
    try {
      // Проверяем, что meta_tag существует
      const metaExists = this.#db.prepare("SELECT 1 FROM meta WHERE tag = ?").get(actor.meta_tag)

      if (!metaExists) {
        throw new Error(`Meta with tag '${actor.meta_tag}' does not exist`)
      }

      // Если указан parent_id, проверяем, что родитель существует
      if (actor.parent_id !== null && actor.parent_id !== undefined) {
        const parentExists = this.#db.prepare("SELECT 1 FROM actor WHERE id = ?").get(actor.parent_id)

        if (!parentExists) {
          throw new Error(`Parent actor with id ${actor.parent_id} does not exist`)
        }
      }

      // Создаем актора в транзакции
      return this.#db.transaction(() => {
        const result = this.#db
          .prepare(createActorQuery)
          .run(actor.meta_tag, actor.parent_id, actor.idx, actor.snapshot)
        return Number(result.lastInsertRowid)
      })()
    } catch (error) {
      console.error("Error in createActor:", error)
      throw error
    }
  }

  /**
   * Обновляет снапшот актора
   */
  updateActorSnapshot(id: number, snapshot: string): void {
    this.#db.prepare(updateActorSnapshotQuery).run(snapshot, id)
  }

  /**
   * Получает всех дочерних акторов для указанного родителя
   */
  getChildActors(parentId: number): SQLiteActorStore[] {
    return this.#db.prepare(getChildActorsQuery).all(parentId) as SQLiteActorStore[]
  }

  /**
   * Удаляет актора и всех его потомков (каскадно)
   */
  deleteActor(id: number): void {
    this.#db.prepare(deleteActorQuery).run(id)
    // Каскадное удаление сработает автоматически благодаря ON DELETE CASCADE
  }

  // ===== Методы для работы с Patch =====

  /**
   * Добавляет новый патч
   */
  addPatch(patch: Omit<PatchRecord, "id" | "timestamp">): number {
    const result = this.#db.prepare(addPatchQuery).run(patch.actor_id, patch.op, patch.path, patch.value)

    return Number(result.lastInsertRowid)
  }

  /**
   * Получает все патчи для указанного актора
   */
  getPatchesByActor(actorId: number): PatchRecord[] {
    return this.#db.prepare(getPatchesByActorQuery).all(actorId) as PatchRecord[]
  }

  /**
   * Получает патч по ID
   */
  getPatch(id: number): PatchRecord | null {
    return this.#db.prepare(getPatchQuery).get(id) as PatchRecord | null
  }

  /**
   * Удаляет патч по ID
   */
  deletePatch(id: number): void {
    this.#db.prepare(deletePatchQuery).run(id)
  }

  // ===== Комплексные операции =====

  /**
   * Создает актора и его корневой патч в одной транзакции
   */
  createActorWithInitialPatch(
    actor: Omit<SQLiteActorStore, "id" | "timestamp">,
    initialPatch: Omit<PatchRecord, "id" | "actor_id" | "timestamp">
  ): { actorId: number; patchId: number } {
    let actorId: number
    let patchId: number

    this.#transaction((db) => {
      // Создаем актора
      const actorResult = db.prepare(createActorQuery).run(actor.meta_tag, actor.parent_id, actor.idx, actor.snapshot)

      actorId = Number(actorResult.lastInsertRowid)

      // Создаем начальный патч
      const patchResult = db.prepare(addPatchQuery).run(actorId, initialPatch.op, initialPatch.path, initialPatch.value)

      patchId = Number(patchResult.lastInsertRowid)
    })

    return { actorId: actorId!, patchId: patchId! }
  }
  getActorById(id: number): ActorStore | null {
    const actor = this.#db.prepare(`SELECT * FROM actor WHERE id = $id`).as(SQLiteActorStore).get({ id })
    if (!actor) return null
    return actor
  }
  getActor(tag: string): ActorStore | null {
    const actor = this.#db
      .prepare(`SELECT * FROM actor WHERE meta_tag = $meta_tag`)
      .as(SQLiteActorStore)
      .get({ meta_tag: tag })
    if (!actor) return null
    return actor
  }
  /**
   * Получает полное дерево акторов, начиная с корневого
   */
  getActorTree(rootTag: string): ActorTreeNode | null {
    const actor = this.getActor(rootTag)
    if (!actor) return null

    const children = this.getChildActors(actor.id)
      .map((child) => this.getActorTree(child.meta_tag))
      .filter((child): child is ActorTreeNode => child !== null)

    // Создаем объект, исключая parent_id и idx, так как они не нужны в дереве
    const { parent_id, idx, ...actorWithoutParentInfo } = actor

    return {
      ...actorWithoutParentInfo,
      children,
    }
  }

  getAllActors() {
    return this.#db.prepare("SELECT * FROM actor").as(SQLiteActorStore).all()
  }
  // ===== Устаревшие методы =====

  /**
   * @deprecated Используйте setMeta
   */
  setSnapshot(message: Message) {
    this.setMeta({
      tag: message.meta.tag,
      fingerprint: "fingerprint-placeholder",
    })
  }

  /**
   * @deprecated Используйте getMeta
   */
  getSnapshot(tag: string) {
    return this.getMeta(tag)
  }

  // ===== Управление соединением =====

  /**
   * Закрывает соединение с базой данных
   */
  close(): void {
    this.#db.close()
  }

  /**
   * Выполняет резервное копирование базы данных в указанный файл
   */
  backup(destinationPath: string): void {
    // Создаем новую базу данных для бэкапа
    const backupDb = new Database(destinationPath)

    try {
      // Копируем схему и данные с помощью SQL-запросов
      // 1. Копируем схему
      const tables = this.#db.query(getTablesQuery).all() as Array<{ name: string; sql: string }>

      for (const { name, sql } of tables) {
        if (sql) {
          backupDb.exec(sql)

          // Копируем данные
          const data = this.#db.query(`SELECT * FROM ${name}`).all()
          if (data.length > 0) {
            const columns = Object.keys(data[0] as object)
            const placeholders = columns.map(() => "?").join(", ")
            const insert = backupDb.prepare(`INSERT INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`)

            for (const row of data) {
              // Преобразуем значения строки в массив и передаем его с помощью spread оператора
              const values = columns.map((col) => (row as any)[col])
              // @ts-ignore - игнорируем ошибку типизации, так как мы уверены в структуре данных
              insert.run(...values)
            }
          }
        }
      }

      // 2. Копируем индексы, представления и триггеры
      const otherObjects = this.#db.query(getOtherObjectsQuery).all() as Array<{ sql: string }>

      for (const { sql } of otherObjects) {
        if (sql) {
          backupDb.exec(sql)
        }
      }

      // 3. Применяем PRAGMA настройки
      const pragmas = ["PRAGMA journal_mode", "PRAGMA synchronous", "PRAGMA cache_size", "PRAGMA foreign_keys"]

      for (const pragma of pragmas) {
        const value = this.#db.query(`${pragma}`).get() as Record<string, any>
        if (value) {
          const setting = Object.values(value)[0]
          backupDb.exec(`${pragma} = ${setting}`)
        }
      }
    } finally {
      // Всегда закрываем соединение с бэкапной БД
      backupDb.close()
    }
  }
}
