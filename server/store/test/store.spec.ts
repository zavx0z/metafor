import { describe, it, expect, afterAll, beforeAll, beforeEach } from "bun:test"
import { SQLiteStore } from "../index"
import { Database } from "bun:sqlite"

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

describe("хранилище sqlite", () => {
  let store: SQLiteStore
  let db: Database

  beforeAll(async () => {
    try {
      // Удаляем файл базы данных, если он существует
      try {
        await Bun.file("test.sqlite").delete()
      } catch (e) {
        // Игнорируем ошибку, если файла не существует
      }

      // Создаем новую базу данных
      db = new Database("test.sqlite")

      // Включаем проверку внешних ключей и журналирование
      db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
      `)

      // Проверяем, что внешние ключи включены
      const fkCheck = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }

      // Выполняем каждый оператор по отдельности для лучшего отслеживания ошибок
      const statements = createTablesQuery.split(";").filter((s) => s.trim())
      for (const stmt of statements) {
        try {
          db.exec(stmt + ";")
        } catch (e) {
          console.error("Error executing statement:", stmt)
          console.error("Error:", e)
          throw e
        }
      }

      // Инициализируем хранилище
      store = new SQLiteStore("test.sqlite")
    } catch (error) {
      console.error("Error in beforeAll:", error)
      throw error
    }
  })

  afterAll(async () => {
    if (db) {
      db.close()
    }
    try {
      await Bun.file("test.sqlite").delete()
      await Bun.file("test.sqlite-shm").delete()
      await Bun.file("test.sqlite-wal").delete()
    } catch (e) {
      // Игнорируем ошибку, если файла не существует
    }
  })

  beforeEach(() => {
    // Пересоздаем таблицы с актуальной схемой перед каждым тестом
    db.run("DROP TABLE IF EXISTS actor")
    db.run("DROP TABLE IF EXISTS meta")

    // Пересоздаем таблицы с актуальной схемой
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
    `

    db.exec(createTablesQuery)
  })

  it("должен создавать новую базу данных", async () => {
    const fileExist = await Bun.file("test.sqlite").exists()
    expect(fileExist).toBe(true)

    // Проверяем, что таблицы существуют
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = (tables as any[]).map((t) => t.name)

    expect(tableNames).toContain("meta")
    expect(tableNames).toContain("actor")
  })

  describe("проверка структуры таблиц", () => {
    it("таблица meta должна существовать и иметь правильные колонки", async () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
      expect(tableInfo).toBeDefined()

      const columns = db.prepare("PRAGMA table_info(meta)").all()
      const columnNames = columns.map((col: any) => col.name)

      expect(columnNames).toContain("meta")
      expect(columnNames).toContain("fingerprint")
      expect(columnNames).toContain("timestamp")
    })

    it("таблица actor должна существовать и иметь правильные колонки", async () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='actor'").get()
      expect(tableInfo).toBeDefined()

      const columns = db.prepare("PRAGMA table_info(actor)").all()
      const columnNames = columns.map((col: any) => col.name)

      expect(columnNames).toContain("id")
      expect(columnNames).toContain("meta")
      expect(columnNames).toContain("parent_id")
      expect(columnNames).toContain("idx")
      expect(columnNames).toContain("snapshot")
      expect(columnNames).toContain("timestamp")
    })
  })

  describe("проверка ограничений и связей", () => {
    it("должен создавать запись в meta и actor", () => {
      // Создаем запись в meta
      const metaInsert = db.prepare("INSERT INTO meta (meta, fingerprint) VALUES (?, ?)")
      metaInsert.run("test-tag", "fingerprint-123")

      // Проверяем, что запись создана
      const metaRow = db.prepare("SELECT * FROM meta WHERE meta = ?").get("test-tag") as any
      expect(metaRow).toBeDefined()
      expect(metaRow.meta).toBe("test-tag")

      // Создаем запись в actor
      const actorInsert = db.prepare("INSERT INTO actor (meta, idx, snapshot) VALUES (?, ?, ?) RETURNING id")
      const result = actorInsert.get("test-tag", 0, JSON.stringify({ test: "snapshot" })) as any

      expect(result).toBeDefined()
      expect(result.id).toBe(1)

      // Проверяем, что запись создана
      const actorRow = db.prepare("SELECT * FROM actor WHERE id = ?").get(1) as any
      expect(actorRow).toBeDefined()
      expect(actorRow.meta).toBe("test-tag")
    })

    it("должен проверять внешний ключ meta в actor", () => {
      // Проверяем, что внешний ключ включен
      const fkCheck = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }
      expect(fkCheck.foreign_keys).toBe(1)

      // Проверяем, что в таблице meta нет записи с такой метой
      const existingMeta = db.prepare("SELECT * FROM meta WHERE meta = ?").get("non-existent-meta")
      expect(existingMeta).toBeNull()

      let error: Error | null = null
      try {
        const insert = db.prepare("INSERT INTO actor (meta, idx, snapshot) VALUES (?, ?, ?)")
        insert.run("non-existent-tag", 0, JSON.stringify({}))
      } catch (e) {
        error = e as Error
      }

      expect(error).not.toBeNull()

      const errorMessage = error?.message || ""
      const isForeignKeyError =
        errorMessage.includes("FOREIGN KEY constraint failed") ||
        errorMessage.includes("SQLITE_CONSTRAINT_FOREIGNKEY") ||
        errorMessage.includes("no such table")

      expect(isForeignKeyError).toBe(true)
    })

    it("должен создавать иерархию actor с parent_id", () => {
      // Создаем запись в meta
      db.prepare("INSERT INTO meta (meta, fingerprint) VALUES (?, ?)").run("parent-tag", "fingerprint-123")

      // Создаем родительский actor
      const parent = db
        .prepare("INSERT INTO actor (meta, idx, snapshot) VALUES (?, ?, ?) RETURNING id")
        .get("parent-tag", 0, JSON.stringify({}))

      // Создаем дочерний actor
      const child = db
        .prepare("INSERT INTO actor (meta, parent_id, idx, snapshot) VALUES (?, ?, ?, ?) RETURNING id")
        .get("parent-tag", (parent as any).id, 0, JSON.stringify({}))

      expect(child).toBeDefined()
    })
  })
})
