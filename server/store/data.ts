import path from "node:path"
import { Database, Statement } from "bun:sqlite"
import type { DataStore, ContextSchema } from "../../core/store.t"

/**
 * Серверный DataStore (SQLite)
 *
 * Универсальный стор для работы с данными на сервере.
 * Создает таблицы динамически по Context Schema.
 * - Таблица `{table}` с колонками по схеме
 * - Автоматическое создание индексов
 * - Поддержка дефолтных значений
 */
export async function DataStore(dbFile: string): Promise<DataStore> {
  const dbPath = path.resolve(dbFile)
  const db = new Database(dbPath)
  db.run("PRAGMA journal_mode=WAL;")
  db.run("PRAGMA synchronous=NORMAL;")

  // Кеш prepared statements для каждой таблицы
  const statements = new Map<
    string,
    {
      getAll: Statement<[]>
      insert: Statement<any[]>
      drop: Statement<[]>
    }
  >()

  // Кеш схем для таблиц
  const schemas = new Map<string, ContextSchema>()

  // Преобразовать тип Context Schema в SQL тип
  const getSqlType = (type: string, required?: boolean): string => {
    const nullable = required ? "NOT NULL" : ""
    switch (type) {
      case "string":
      case "enum":
        return `TEXT ${nullable}`
      case "number":
        return `REAL ${nullable}`
      case "boolean":
        return `INTEGER ${nullable}`
      default:
        return `TEXT ${nullable}`
    }
  }

  // Создать SQL для создания таблицы
  const buildCreateTableSQL = (table: string, schema: ContextSchema): string => {
    const columns: string[] = []
    const idFields: string[] = []

    Object.entries(schema).forEach(([fieldName, fieldSchema]) => {
      const sqlType = getSqlType(fieldSchema.type, fieldSchema.required)
      const defaultValue = fieldSchema.default !== undefined ? `DEFAULT ${JSON.stringify(fieldSchema.default)}` : ""

      if (fieldSchema.id) {
        idFields.push(fieldName)
      }

      columns.push(`${fieldName} ${sqlType} ${defaultValue}`.trim())
    })

    // Если нет id полей, добавляем автоматический id
    if (idFields.length === 0) {
      columns.unshift("id INTEGER PRIMARY KEY AUTOINCREMENT")
    } else {
      // Добавить составной PRIMARY KEY если есть id поля
      columns.push(`PRIMARY KEY (${idFields.join(", ")})`)
    }

    return `CREATE TABLE IF NOT EXISTS ${table} (${columns.join(", ")});`
  }

  // Получить id поля из схемы
  const getIdFields = (schema: ContextSchema): string[] => {
    return Object.entries(schema)
      .filter(([_, fieldSchema]) => fieldSchema.id === true)
      .map(([fieldName, _]) => fieldName)
  }

  // Создать WHERE условие для запросов
  const buildWhereClause = (query: Record<string, any>): { whereClause: string; params: any[] } => {
    const conditions: string[] = []
    const params: any[] = []

    Object.entries(query).forEach(([key, value]) => {
      conditions.push(`${key} = ?`)
      params.push(value)
    })

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    }
  }

  // Создать таблицу если не существует
  const ensureTable = (table: string, schema: ContextSchema) => {
    if (!statements.has(table)) {
      const createSQL = buildCreateTableSQL(table, schema)
      db.run(createSQL)

      // Создать prepared statements для таблицы
      const columnNames = Object.keys(schema)
      const insertColumns = columnNames.join(", ")
      const insertPlaceholders = columnNames.map(() => "?").join(", ")

      statements.set(table, {
        getAll: db.query(`SELECT * FROM ${table};`),
        insert: db.query(`INSERT INTO ${table}(${insertColumns}) VALUES (${insertPlaceholders});`),
        drop: db.query(`DROP TABLE IF EXISTS ${table};`),
      })
    }
  }

  return {
    async createTableIfNotExist(table: string, schema: ContextSchema): Promise<void> {
      ensureTable(table, schema)
      schemas.set(table, schema)
    },

    async get(table: string, query: Record<string, any>): Promise<any | null> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      const { whereClause, params } = buildWhereClause(query)
      const sql = `SELECT * FROM ${table} ${whereClause} LIMIT 1`

      const stmt = db.query(sql)
      const row = stmt.get(...params) as any
      return row || null
    },

    async getAll(table: string, query?: Record<string, any>): Promise<any[]> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      if (query) {
        const { whereClause, params } = buildWhereClause(query)
        const sql = `SELECT * FROM ${table} ${whereClause}`
        const stmt = db.query(sql)
        const rows = stmt.all(...params) as any[]
        return rows
      } else {
        const stmt = statements.get(table)!
        const rows = stmt.getAll.all() as any[]
        return rows
      }
    },

    async update(table: string, query: Record<string, any>, data: any): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      const { whereClause, params } = buildWhereClause(query)
      const sql = `SELECT * FROM ${table} ${whereClause} LIMIT 1`

      const stmt = db.query(sql)
      const existing = stmt.get(...params) as any
      if (!existing) {
        throw new Error(`Record not found for update`)
      }

      // Построить SET часть UPDATE запроса
      const updateFields: string[] = []
      const updateParams: any[] = []

      Object.entries(data).forEach(([key, value]) => {
        if (schema[key]) {
          // Проверить, что поле существует в схеме
          updateFields.push(`${key} = ?`)
          updateParams.push(value)
        }
      })

      if (updateFields.length === 0) {
        return // Нет полей для обновления
      }

      const updateSQL = `UPDATE ${table} SET ${updateFields.join(", ")} ${whereClause}`
      const updateStmt = db.query(updateSQL)
      updateStmt.run(...updateParams, ...params)
    },

    async insert(table: string, data: any): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      // Применить значения по умолчанию из схемы
      const processedData = { ...data }
      Object.entries(schema).forEach(([fieldName, fieldSchema]) => {
        if (processedData[fieldName] === undefined && fieldSchema.default !== undefined) {
          processedData[fieldName] = fieldSchema.default
        }
      })

      const idFields = getIdFields(schema)

      // Если нет id полей в схеме, используем автоматический id
      if (idFields.length === 0) {
        // Не добавляем id в данные - SQLite автоматически сгенерирует
        const stmt = statements.get(table)!
        const columnNames = Object.keys(schema)
        const values = columnNames.map((col) => processedData[col])
        stmt.insert.run(...values)
      } else {
        // Генерируем ID для id полей если не указаны
        idFields.forEach((idField) => {
          if (!processedData[idField]) {
            processedData[idField] = `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        })

        const stmt = statements.get(table)!
        const columnNames = Object.keys(schema)
        const values = columnNames.map((col) => processedData[col])
        stmt.insert.run(...values)
      }
    },

    async delete(table: string, query: Record<string, any>): Promise<void> {
      const schema = schemas.get(table)
      if (!schema) {
        throw new Error(`Table ${table} not created with schema. Use createTableIfNotExist first.`)
      }

      const { whereClause, params } = buildWhereClause(query)
      const sql = `DELETE FROM ${table} ${whereClause}`

      const stmt = db.query(sql)
      stmt.run(...params)
    },

    async drop(table: string): Promise<void> {
      const stmt = statements.get(table)!
      stmt.drop.run()
      statements.delete(table)
      schemas.delete(table)
    },
  }
}
