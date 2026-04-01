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
              type,
              required,
              identifier,
              data_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(1, "alpha/meta", "items", "array<string>", 1, 1, "items"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("нормализует array defaults поэлементно и enum defaults через stable variant id", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(1, "alpha/meta", "items", "array<string>", 1)

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "status", "enum<string>", 1)

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(3, "alpha/meta", "fallback_status", "enum<string>", 1)

      database
        .query(
          `INSERT INTO field_array_default(field_id, meta_src, field_type)
           VALUES (?, ?, ?)`,
        )
        .run(1, "alpha/meta", "array<string>")

      database
        .query(
          `INSERT INTO field_array_default_item(id, field_id, meta_src, field_type, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(100, 1, "alpha/meta", "array<string>", 0)

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_id, field_id, meta_src, item_value)
           VALUES (?, ?, ?, ?)`,
        )
        .run(100, 1, "alpha/meta", "draft")

      database
        .query(
          `INSERT INTO field_array_default_item(id, field_id, meta_src, field_type, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(101, 1, "alpha/meta", "array<string>", 1)

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_id, field_id, meta_src, item_value)
           VALUES (?, ?, ?, ?)`,
        )
        .run(101, 1, "alpha/meta", "published")

      expect(() =>
        database
          .query(
            `INSERT INTO field_array_number_default_item(item_id, field_id, meta_src, item_value)
             VALUES (?, ?, ?, ?)`,
          )
          .run(100, 1, "alpha/meta", 1),
      ).toThrow()

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, meta_src, field_type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(200, 2, "alpha/meta", "enum<string>")

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, field_id, meta_src, item_value)
           VALUES (?, ?, ?, ?)`,
        )
        .run(200, 2, "alpha/meta", "draft")

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, meta_src, field_type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(201, 2, "alpha/meta", "enum<string>")

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, field_id, meta_src, item_value)
           VALUES (?, ?, ?, ?)`,
        )
        .run(201, 2, "alpha/meta", "published")

      database
        .query(
          `INSERT INTO field_enum_default(field_id, meta_src, field_type, variant_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "enum<string>", 201)

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, meta_src, field_type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(300, 3, "alpha/meta", "enum<string>")

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, field_id, meta_src, item_value)
           VALUES (?, ?, ?, ?)`,
        )
        .run(300, 3, "alpha/meta", "archived")

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_default(field_id, meta_src, field_type, variant_id)
             VALUES (?, ?, ?, ?)`,
          )
          .run(3, "alpha/meta", "enum<string>", 201),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает process subtype-таблицы и same-meta ссылки", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(10, "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(20, "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO process(id, meta_src, key, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(2, "alpha/meta", "destroy", "finally")

      database
        .query(
          `INSERT INTO process_finally(process_id, meta_src, before_src)
           VALUES (?, ?, ?)`,
        )
        .run(2, "alpha/meta", "() => {}")

      database
        .query(
          `INSERT INTO process(id, meta_src, key, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run(3, "alpha/meta", "load", "action")

      database
        .query(
          `INSERT INTO process_action(process_id, meta_src, action_src)
           VALUES (?, ?, ?)`,
        )
        .run(3, "alpha/meta", "./actions/load.ts")

      expect(() =>
        database
          .query(
            `INSERT INTO process_action(process_id, meta_src, action_src)
             VALUES (?, ?, ?)`,
          )
          .run(2, "alpha/meta", "./actions/remove.ts"),
      ).toThrow()

      database
        .query(
          `INSERT INTO process_action_read(meta_src, process_id, field_id, phase)
           VALUES (?, ?, ?, ?)`,
        )
        .run("alpha/meta", 3, 10, "action")

      database
        .query(
          `INSERT INTO process_action_write(meta_src, process_id, field_id, phase)
           VALUES (?, ?, ?, ?)`,
        )
        .run("alpha/meta", 3, 10, "success")

      database
        .query(
          `INSERT INTO process_finally_read(meta_src, process_id, field_id)
           VALUES (?, ?, ?)`,
        )
        .run("alpha/meta", 2, 10)

      expect(() =>
        database
          .query(
            `INSERT INTO process_finally_read(meta_src, process_id, field_id)
             VALUES (?, ?, ?)`,
          )
          .run("alpha/meta", 3, 10),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO process_action_read(meta_src, process_id, field_id, phase)
             VALUES (?, ?, ?, ?)`,
          )
          .run("alpha/meta", 3, 20, "action"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает нормализованные particles и fuzzy subtype shape", () => {
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
          `INSERT INTO fuzzy(id, meta_src, kind)
           VALUES (?, ?, ?)`,
        )
        .run(2, "alpha/meta", "condition")

      database
        .query(
          `INSERT INTO fuzzy_condition(fuzzy_id, meta_src, data)
           VALUES (?, ?, ?)`,
        )
        .run(2, "alpha/meta", JSON.stringify("/state"))

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
          `INSERT INTO fuzzy(id, meta_src, kind)
           VALUES (?, ?, ?)`,
        )
        .run(5, "alpha/meta", "meta")

      database
        .query(
          `INSERT INTO fuzzy_meta(fuzzy_id, meta_src, src, fields, mass)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          5,
          "alpha/meta",
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
            `INSERT INTO fuzzy_meta(fuzzy_id, meta_src, src)
             VALUES (?, ?, ?)`,
          )
          .run(2, "alpha/meta", JSON.stringify({ data: "/fields/operation" })),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO fuzzy_condition(fuzzy_id, meta_src, data)
             VALUES (?, ?, ?)`,
          )
          .run(5, "alpha/meta", JSON.stringify("/state")),
      ).toThrow()
    } finally {
      database.close()
    }
  })
})
