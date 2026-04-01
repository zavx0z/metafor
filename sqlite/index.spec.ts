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

  test("держит field как минимальное canonical ядро без ad-hoc флагов и parent-derived дублей", () => {
    const database = openDatabase()

    try {
      const fieldColumns = (
        database.query(`PRAGMA table_info(field)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const fieldDefaultColumns = (
        database.query(`PRAGMA table_info(field_default)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const fieldArrayDefaultColumns = (
        database.query(`PRAGMA table_info(field_array_default)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const fieldArrayItemColumns = (
        database.query(`PRAGMA table_info(field_array_default_item)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const fieldEnumVariantColumns = (
        database.query(`PRAGMA table_info(field_enum_variant)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const fieldEnumDefaultColumns = (
        database.query(`PRAGMA table_info(field_enum_default)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(fieldColumns).toEqual(["id", "meta_src", "key", "type", "required", "label"])
      expect(fieldDefaultColumns).toEqual(["field_id"])
      expect(fieldArrayDefaultColumns).toEqual(["field_id"])
      expect(fieldArrayItemColumns).toEqual(["id", "field_id", "position"])
      expect(fieldEnumVariantColumns).toEqual(["id", "field_id", "position"])
      expect(fieldEnumDefaultColumns).toEqual(["field_id", "variant_id"])
    } finally {
      database.close()
    }
  })

  test("режет невалидные field defaults и держит типизацию в child-таблицах через parent field", () => {
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
        .run(2, "alpha/meta", "maybe_title", "string", 0)

      expect(() =>
        database.query(`INSERT INTO field_default(field_id) VALUES (?)`).run(2),
      ).toThrow()

      database.query(`INSERT INTO field_default(field_id) VALUES (?)`).run(1)

      database.query(`INSERT INTO field_array_default(field_id) VALUES (?)`).run(1)

      database
        .query(
          `INSERT INTO field_array_default_item(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(100, 1, 0)

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_id, item_value)
           VALUES (?, ?)`,
        )
        .run(100, "draft")

      expect(() =>
        database
          .query(
            `INSERT INTO field_array_number_default_item(item_id, item_value)
             VALUES (?, ?)`,
          )
          .run(100, 1),
      ).toThrow()

      expect(() =>
        database.query(`INSERT INTO field_string_default(field_id, default_value) VALUES (?, ?)`).run(1, "wrong"),
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

      database.query(`INSERT INTO field_default(field_id) VALUES (?)`).run(1)
      database.query(`INSERT INTO field_default(field_id) VALUES (?)`).run(2)
      database.query(`INSERT INTO field_default(field_id) VALUES (?)`).run(3)

      database.query(`INSERT INTO field_array_default(field_id) VALUES (?)`).run(1)

      database
        .query(
          `INSERT INTO field_array_default_item(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(100, 1, 0)

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_id, item_value)
           VALUES (?, ?)`,
        )
        .run(100, "draft")

      database
        .query(
          `INSERT INTO field_array_default_item(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(101, 1, 1)

      expect(() =>
        database
          .query(
            `INSERT INTO field_array_number_default_item(item_id, item_value)
             VALUES (?, ?)`,
          )
          .run(100, 1),
      ).toThrow()

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_id, item_value)
           VALUES (?, ?)`,
        )
        .run(101, "published")

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(200, 2, 0)

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, item_value)
           VALUES (?, ?)`,
        )
        .run(200, "draft")

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(201, 2, 1)

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, item_value)
           VALUES (?, ?)`,
        )
        .run(201, "published")

      database
        .query(
          `INSERT INTO field_enum_default(field_id, variant_id)
           VALUES (?, ?)`,
        )
        .run(2, 201)

      database
        .query(
          `INSERT INTO field_enum_variant(id, field_id, position)
           VALUES (?, ?, ?)`,
        )
        .run(300, 3, 0)

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_id, item_value)
           VALUES (?, ?)`,
        )
        .run(300, "archived")

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_string_variant(variant_id, item_value)
             VALUES (?, ?)`,
          )
          .run(300, "published"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_default(field_id, variant_id)
             VALUES (?, ?)`,
          )
          .run(3, 201),
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

  test("сохраняет same-meta инвариант после перехода на single-id foreign keys", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(1, "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(id, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(2, "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO state(id, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run(10, "alpha/meta", "idle", 0)

      database
        .query(
          `INSERT INTO state(id, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run(20, "beta/meta", "idle", 0)

      expect(() =>
        database
          .query(
            `INSERT INTO transition(id, meta_src, from_state_id, to_state_id, position)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(100, "alpha/meta", 10, 20, 0),
      ).toThrow()

      database
        .query(
          `INSERT INTO state(id, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run(11, "alpha/meta", "done", 1)

      database
        .query(
          `INSERT INTO transition(id, meta_src, from_state_id, to_state_id, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(101, "alpha/meta", 10, 11, 0)

      expect(() =>
        database
          .query(
            `INSERT INTO condition(meta_src, transition_id, field_id, condition_json)
             VALUES (?, ?, ?, ?)`,
          )
          .run("alpha/meta", 101, 2, JSON.stringify({ eq: "x" })),
      ).toThrow()

      database
        .query(
          `INSERT INTO reaction(id, meta_src, key, label, cond_source, update_source)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(200, "alpha/meta", "refresh", "Refresh", "() => true", "() => ({})")

      expect(() =>
        database
          .query(
            `INSERT INTO reaction_state(meta_src, reaction_id, state_id)
             VALUES (?, ?, ?)`,
          )
          .run("alpha/meta", 200, 20),
      ).toThrow()

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(300, "alpha/meta", null, 0, "wimp")

      database
        .query(
          `INSERT INTO wimp(id, meta_src, src)
           VALUES (?, ?, ?)`,
        )
        .run(300, "alpha/meta", "alpha/root")

      database
        .query(
          `INSERT INTO particle(id, meta_src, parent_id, position, type)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(400, "beta/meta", null, 0, "wimp")

      database
        .query(
          `INSERT INTO wimp(id, meta_src, src)
           VALUES (?, ?, ?)`,
        )
        .run(400, "beta/meta", "beta/root")

      expect(() =>
        database
          .query(
            `INSERT INTO particle(id, meta_src, parent_id, position, type)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(301, "alpha/meta", 400, 1, "macho"),
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
