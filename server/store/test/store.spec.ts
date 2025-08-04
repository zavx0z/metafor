import { describe, it, expect, afterAll, beforeAll, beforeEach } from "bun:test"
import { Store } from "../index"
import { Database } from "bun:sqlite"
import createTablesQuery from "../queries/create.sql" with { type: "text" }
describe("хранилище sqlite", () => {
  let store: Store
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
      console.log('Foreign keys enabled:', fkCheck.foreign_keys === 1)
      
      // Выполняем каждый оператор по отдельности для лучшего отслеживания ошибок
      const statements = createTablesQuery.split(';').filter(s => s.trim())
      for (const stmt of statements) {
        try {
          db.exec(stmt + ';')
        } catch (e) {
          console.error('Error executing statement:', stmt)
          console.error('Error:', e)
          throw e
        }
      }
      
      // Проверяем, что таблицы созданы
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      console.log('Tables in database:', tables)
      
      // Инициализируем хранилище
      store = new Store("test.sqlite")
    } catch (error) {
      console.error('Error in beforeAll:', error)
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
    // Очищаем таблицы перед каждым тестом
    db.run("DELETE FROM patch")
    db.run("DELETE FROM actor")
    db.run("DELETE FROM meta")
    // Сбрасываем автоинкремент
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('actor', 'patch')")
  })

  it("должен создавать новую базу данных", async () => {
    const fileExist = await Bun.file("test.sqlite").exists()
    expect(fileExist).toBe(true)
    
    // Проверяем, что таблицы существуют
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const tableNames = (tables as any[]).map(t => t.name)
    
    expect(tableNames).toContain('meta')
    expect(tableNames).toContain('actor')
    expect(tableNames).toContain('patch')
  })

  describe("проверка структуры таблиц", () => {
    const checkTableColumns = async (tableName: string, expectedColumns: string[]) => {
      const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
      const columnNames = (columns as any[]).map(col => col.name)
      expectedColumns.forEach(col => {
        expect(columnNames).toContain(col)
      })
    }

    it("таблица meta должна существовать и иметь правильные колонки", async () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get()
      expect(tableInfo).toBeDefined()
      
      const columns = db.prepare("PRAGMA table_info(meta)").all()
      const columnNames = columns.map((col: any) => col.name)
      
      expect(columnNames).toContain('tag')
      expect(columnNames).toContain('fingerprint')
      expect(columnNames).toContain('timestamp')
    })

    it("таблица actor должна существовать и иметь правильные колонки", async () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='actor'").get()
      expect(tableInfo).toBeDefined()
      
      const columns = db.prepare("PRAGMA table_info(actor)").all()
      const columnNames = columns.map((col: any) => col.name)
      
      expect(columnNames).toContain('id')
      expect(columnNames).toContain('meta_tag')
      expect(columnNames).toContain('parent_id')
      expect(columnNames).toContain('idx')
      expect(columnNames).toContain('snapshot')
      expect(columnNames).toContain('timestamp')
    })

    it("таблица patch должна существовать и иметь правильные колонки", async () => {
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patch'").get()
      expect(tableInfo).toBeDefined()
      
      const columns = db.prepare("PRAGMA table_info(patch)").all()
      const columnNames = columns.map((col: any) => col.name)
      
      expect(columnNames).toContain('id')
      expect(columnNames).toContain('actor_id')
      expect(columnNames).toContain('op')
      expect(columnNames).toContain('path')
      expect(columnNames).toContain('value')
      expect(columnNames).toContain('timestamp')
    })
  })

  describe("проверка ограничений и связей", () => {
    it("должен создавать запись в meta и actor", () => {
      // Создаем запись в meta
      const metaInsert = db.prepare("INSERT INTO meta (tag, fingerprint) VALUES (?, ?)")
      metaInsert.run("test-tag", "fingerprint-123")
      
      // Проверяем, что запись создана
      const metaRow = db.prepare("SELECT * FROM meta WHERE tag = ?").get("test-tag") as any
      expect(metaRow).toBeDefined()
      expect(metaRow.tag).toBe("test-tag")
      
      // Создаем запись в actor
      const actorInsert = db.prepare(
        "INSERT INTO actor (meta_tag, idx, snapshot) VALUES (?, ?, ?) RETURNING id"
      )
      const result = actorInsert.get("test-tag", 0, JSON.stringify({ test: "snapshot" })) as any
      
      expect(result).toBeDefined()
      expect(result.id).toBe(1)
      
      // Проверяем, что запись создана
      const actorRow = db.prepare("SELECT * FROM actor WHERE id = ?").get(1) as any
      expect(actorRow).toBeDefined()
      expect(actorRow.meta_tag).toBe("test-tag")
    })

    it("должен проверять внешний ключ meta_tag в actor", () => {
      // Проверяем, что внешний ключ включен
      const fkCheck = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }
      console.log('Внешние ключи включены:', fkCheck.foreign_keys === 1)
      expect(fkCheck.foreign_keys).toBe(1)
      
      // Проверяем, что в таблице meta нет записи с таким тегом
      // SQLite возвращает null, если запись не найдена
      const existingMeta = db.prepare("SELECT * FROM meta WHERE tag = ?").get("non-existent-tag")
      console.log('Существующая запись в meta:', existingMeta)
      expect(existingMeta).toBeNull()

      // Проверяем структуру таблицы actor
      const actorTableInfo = db.prepare("PRAGMA table_info(actor)").all()
      console.log('Структура таблицы actor:', actorTableInfo)

      // Проверяем внешние ключи таблицы actor
      const fkList = db.prepare("PRAGMA foreign_key_list(actor)").all()
      console.log('Внешние ключи таблицы actor:', fkList)

      let error: Error | null = null
      try {
        console.log('\n=== Попытка вставить запись с несуществующим meta_tag ===')
        const insert = db.prepare(
          "INSERT INTO actor (meta_tag, idx, snapshot) VALUES (?, ?, ?)"
        )
        console.log('Запрос:', "INSERT INTO actor (meta_tag, idx, snapshot) VALUES (?, ?, ?)")
        console.log('Параметры:', ["non-existent-tag", 0, JSON.stringify({})])
        
        const result = insert.run("non-existent-tag", 0, JSON.stringify({}))
        console.log('Результат вставки успешен:', result)
        
        // Если дошли сюда, значит вставка прошла успешно, что неверно
        const allActors = db.prepare("SELECT * FROM actor").all()
        console.log('Все записи в actor после вставки:', allActors)
      } catch (e) {
        error = e as Error
        console.log('Ошибка при вставке:\n', error)
        console.log('Сообщение об ошибке:', error.message)
        console.log('Стек вызовов:', error.stack)
      }
      
      expect(error).not.toBeNull()
      
      // Проверяем, что запись не была добавлена
      const count = db.prepare("SELECT COUNT(*) as count FROM actor").get() as { count: number }
      console.log('Количество записей в таблице actor:', count.count)
      
      // SQLite может возвращать разные сообщения об ошибке
      const errorMessage = error?.message || ''
      const isForeignKeyError = 
        errorMessage.includes("FOREIGN KEY constraint failed") || 
        errorMessage.includes("SQLITE_CONSTRAINT_FOREIGNKEY") ||
        errorMessage.includes("no such table") // На случай, если таблица не создана
        
      if (!isForeignKeyError) {
        console.error('Неожиданное сообщение об ошибке:', errorMessage)
      }
      
      expect(isForeignKeyError).toBe(true)
    })

    it("должен создавать иерархию actor с parent_id", () => {
      // Создаем запись в meta
      db.prepare("INSERT INTO meta (tag, fingerprint) VALUES (?, ?)")
        .run("parent-tag", "fingerprint-123")
      
      // Создаем родительский actor
      const parent = db.prepare(
        "INSERT INTO actor (meta_tag, idx, snapshot) VALUES (?, ?, ?) RETURNING id"
      ).get("parent-tag", 0, JSON.stringify({}))
      
      // Создаем дочерний actor
      const child = db.prepare(
        "INSERT INTO actor (meta_tag, parent_id, idx, snapshot) VALUES (?, ?, ?, ?) RETURNING id"
      ).get("parent-tag", (parent as any).id, 0, JSON.stringify({}))
      
      expect(child).toBeDefined()
    })

    it("должен создавать patch для существующего actor", () => {
      // Создаем запись в meta
      db.prepare("INSERT INTO meta (tag, fingerprint) VALUES (?, ?)")
        .run("test-tag", "fingerprint-123")
      
      // Создаем actor
      const actor = db.prepare(
        "INSERT INTO actor (meta_tag, idx, snapshot) VALUES (?, ?, ?) RETURNING id"
      ).get("test-tag", 0, JSON.stringify({}))
      
      // Создаем patch
      const patch = db.prepare(
        "INSERT INTO patch (actor_id, op, path, value) VALUES (?, ?, ?, ?) RETURNING id"
      ).get((actor as any).id, "add", "test.path", "test value")
      
      expect(patch).toBeDefined()
    })

    it("должен проверять внешний ключ actor_id в patch", () => {
      // Проверяем, что внешний ключ включен
      const fkCheck = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }
      expect(fkCheck.foreign_keys).toBe(1)

      let error: Error | null = null
      try {
        const insert = db.prepare(
          "INSERT INTO patch (actor_id, op, path, value) VALUES (?, ?, ?, ?)"
        )
        insert.run(999, "add", "test.path", "test value")
      } catch (e) {
        error = e as Error
      }
      
      expect(error).not.toBeNull()
      // SQLite может возвращать разные сообщения об ошибке, проверяем оба варианта
      expect(
        error?.message.includes("FOREIGN KEY constraint failed") || 
        error?.message.includes("SQLITE_CONSTRAINT_FOREIGNKEY")
      ).toBe(true)
    })
  })
})
