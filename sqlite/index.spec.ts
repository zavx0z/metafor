import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import {
  initializeMetaforDslSqliteSchema,
  metaforDslIndexNames,
  metaforDslTableNames,
} from "./index.ts"

const openDatabase = (): Database => {
  const database = new Database(":memory:")
  initializeMetaforDslSqliteSchema(database)
  return database
}

describe("sqlite ddl", () => {
  test("создаёт meta-level таблицы и индексы из ddl.sql", () => {
    const database = openDatabase()

    try {
      const tables = (
        database
          .query(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'table'
             ORDER BY name`,
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name)

      const indexes = (
        database
          .query(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'index'
               AND name NOT LIKE 'sqlite_autoindex%'
             ORDER BY name`,
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(tables).toEqual([...metaforDslTableNames].sort())
      expect(indexes).toEqual([...metaforDslIndexNames].sort())
    } finally {
      database.close()
    }
  })

  test("режет невалидные field-ограничения", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO metas(name) VALUES (?)`).run("alpha/meta")

      expect(() =>
        database
          .query(
            `INSERT INTO fields(
              id,
              metaName,
              key,
              position,
              type,
              required,
              identifier,
              dataSource
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(1, "alpha/meta", "items", 0, "array<string>", 1, 1, "items"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает process shape и same-meta ссылки", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO metas(name) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO fields(id, metaName, key, position, type, required)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(10, "alpha/meta", "title", 0, "string", 1)

      database
        .query(
          `INSERT INTO fields(id, metaName, key, position, type, required)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(20, "beta/meta", "title", 0, "string", 1)

      expect(() =>
        database
          .query(
            `INSERT INTO processes(
              id,
              metaName,
              key,
              position,
              type,
              actionSrc,
              beforeSrc
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(1, "alpha/meta", "destroy", 0, "finally", "./actions/remove.ts", "() => {}"),
      ).toThrow()

      database
        .query(
          `INSERT INTO processes(
            id,
            metaName,
            key,
            position,
            type,
            beforeSrc
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "destroy", 0, "finally", "() => {}")

      database
        .query(
          `INSERT INTO processes(
            id,
            metaName,
            key,
            position,
            type,
            actionSrc
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(3, "alpha/meta", "load", 1, "action", "./actions/load.ts")

      expect(() =>
        database
          .query(
            `INSERT INTO process_reads(
              metaName,
              processId,
              type,
              fieldId,
              phase,
              position
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("alpha/meta", 2, "finally", 10, "action", 0),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO process_reads(
              metaName,
              processId,
              type,
              fieldId,
              phase,
              position
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("alpha/meta", 3, "action", 20, "action", 0),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает subtype matter-узлов и порядок корня", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO metas(name) VALUES (?)`).run("alpha/meta")

      database
        .query(
          `INSERT INTO matter_nodes(id, metaName, parentId, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(1, "alpha/meta", null, 0, "el")

      database
        .query(
          `INSERT INTO matter_element_nodes(nodeId, metaName, tag)
           VALUES (?, ?, ?)`,
        )
        .run(1, "alpha/meta", "div")

      expect(() =>
        database
          .query(
            `INSERT INTO matter_nodes(id, metaName, parentId, position, type)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(2, "alpha/meta", null, 0, "text"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_meta_nodes(nodeId, metaName, tag, srcJson)
             VALUES (?, ?, ?, ?)`,
          )
          .run(1, "alpha/meta", "meta-for", JSON.stringify("alpha/child")),
      ).toThrow()
    } finally {
      database.close()
    }
  })
})
