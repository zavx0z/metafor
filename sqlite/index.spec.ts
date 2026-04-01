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
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

      expect(() =>
        database
          .query(
            `INSERT INTO field(
              id,
            meta_src,
            key,
            position,
            type,
            required,
            identifier,
            data_source
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
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(id, meta_src, key, position, type, required)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(10, "alpha/meta", "title", 0, "string", 1)

      database
        .query(
          `INSERT INTO field(id, meta_src, key, position, type, required)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(20, "beta/meta", "title", 0, "string", 1)

      expect(() =>
        database
          .query(
            `INSERT INTO process(
              id,
              meta_src,
              key,
              position,
              type,
              action_src,
              before_src
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(1, "alpha/meta", "destroy", 0, "finally", "./actions/remove.ts", "() => {}"),
      ).toThrow()

      database
        .query(
        `INSERT INTO process(
            id,
            meta_src,
            key,
            position,
            type,
            before_src
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "destroy", 0, "finally", "() => {}")

      database
        .query(
        `INSERT INTO process(
            id,
            meta_src,
            key,
            position,
            type,
            action_src
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(3, "alpha/meta", "load", 1, "action", "./actions/load.ts")

      expect(() =>
        database
          .query(
            `INSERT INTO process_read(
              meta_src,
              process_id,
              type,
              field_id,
              phase,
              position
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("alpha/meta", 2, "finally", 10, "action", 0),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO process_read(
              meta_src,
              process_id,
              type,
              field_id,
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

  test("удерживает нормализованные particles и режет невозможные shape", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(1, "alpha/meta", null, 0, "wimp")

      database
        .query(
          `INSERT INTO wimp(id, meta_src, src)
           VALUES (?, ?, ?)`,
        )
        .run(1, "alpha/meta", "alpha/child")

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", 1, 0, "fuzzy")

      database
        .query(
          `INSERT INTO fuzzy(id, meta_src, kind, data)
           VALUES (?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "condition", JSON.stringify("/state"))

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(3, "alpha/meta", 2, 0, "axion")

      database
        .query(
          `INSERT INTO axion(id, meta_src, data)
           VALUES (?, ?, ?)`,
        )
        .run(3, "alpha/meta", JSON.stringify("/state"))

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(4, "alpha/meta", 1, 1, "macho")

      database
        .query(
          `INSERT INTO macho(id, meta_src, data)
           VALUES (?, ?, ?)`,
        )
        .run(4, "alpha/meta", "/fields/items")

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(5, "alpha/meta", 1, 2, "fuzzy")

      database
        .query(
          `INSERT INTO fuzzy(id, meta_src, kind, src, fields, mass)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          5,
          "alpha/meta",
          "meta",
          JSON.stringify({ data: "/fields/operation" }),
          JSON.stringify({ target: "_[0]" }),
          JSON.stringify({ scope: "nested" }),
        )

      expect(() =>
        database
          .query(
            `INSERT INTO particle(id, meta_src, parent_id, position, type)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(6, "alpha/meta", null, 0, "wimp"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO fuzzy(id, meta_src, kind, src)
             VALUES (?, ?, ?, ?)`,
          )
          .run(3, "alpha/meta", "meta", JSON.stringify({ data: "/fields/operation" })),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO fuzzy(id, meta_src, kind, data, fields)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(2, "alpha/meta", "condition", JSON.stringify("/state"), JSON.stringify({ leaked: true })),
      ).toThrow()
    } finally {
      database.close()
    }
  })
})
