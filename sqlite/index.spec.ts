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
  test("создаёт meta-level таблицы и индексы из sql-модулей dsl", () => {
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

  test("держит transition и condition в ownership-модели без meta_src колонок", () => {
    const database = openDatabase()

    try {
      const transitionColumns = (
        database.query(`PRAGMA table_info(transition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const conditionColumns = (
        database.query(`PRAGMA table_info(condition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(transitionColumns).toEqual(["id", "from_state_id", "to_state_id", "position"])
      expect(conditionColumns).toEqual(["transition_id", "field_id", "condition_json"])
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

  test("сохраняет same-meta инвариант после controlled ownership-step для transition и condition", () => {
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
            `INSERT INTO transition(id, from_state_id, to_state_id, position)
             VALUES (?, ?, ?, ?)`,
          )
          .run(100, 10, 20, 0),
      ).toThrow()

      database
        .query(
          `INSERT INTO state(id, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run(11, "alpha/meta", "done", 1)

      database
        .query(
          `INSERT INTO transition(id, from_state_id, to_state_id, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run(101, 10, 11, 0)

      expect(() =>
        database
          .query(
            `INSERT INTO condition(transition_id, field_id, condition_json)
             VALUES (?, ?, ?)`,
          )
          .run(101, 2, JSON.stringify({ eq: "x" })),
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
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(300, "alpha/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(400, "beta/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(500, "alpha/meta", null, 300, "root", 0)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(600, "beta/meta", null, 400, "root", 0)

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(700, "alpha/meta", 300, 400, "child", 0),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает matter AST shape с typed bindings и зависимостями без потери", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

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
        .run(2, "alpha/meta", "active", "boolean", 1)

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(10, "alpha/meta", "static", "text", "alpha/root")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(11, "alpha/meta", "dynamic", "{ title: _[0], active: _[1] }")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(11, "alpha/meta", 0, "/value/title")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(11, "alpha/meta", 1, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(12, "alpha/meta", "dynamic", "{ owner: _[0], enabled: _[1] }")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(12, "alpha/meta", 0, "/mass/owner")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(12, "alpha/meta", 1, "/mass/enabled")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run(13, "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(13, "alpha/meta", 0, "/state")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(14, "alpha/meta", "dynamic", "${_[0]} && ${_[1]}")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(14, "alpha/meta", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(14, "alpha/meta", 1, "/mass/is-enabled")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run(15, "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(15, "alpha/meta", 0, "/mass/items")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run(16, "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(16, "alpha/meta", 0, "/value/title")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, literal_kind, literal_boolean)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(17, "alpha/meta", "static", "boolean", 1)

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(18, "alpha/meta", "static", "text", "card")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(19, "alpha/meta", "dynamic", "${_[0]} ? 'active' : 'idle'")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(19, "alpha/meta", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(20, "alpha/meta", "dynamic", "${_[0]} ? 'green' : 'red'")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(20, "alpha/meta", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run(21, "alpha/meta", "dynamic", "(event) => _[0](event)")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(21, "alpha/meta", 0, "/mass/handleClick")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run(22, "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
           VALUES (?, ?, ?, ?)`,
        )
        .run(22, "alpha/meta", 0, "[item]/src")

      database
        .query(
          `INSERT INTO matter_binding(id, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(23, "alpha/meta", "static", "text", '{ role: "item" }')

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(100, "alpha/meta", "cond", null)

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(101, "alpha/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(102, "alpha/meta", "log", null)

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(103, "alpha/meta", "map", null)

      database
        .query(
          `INSERT INTO matter_node(id, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run(104, "alpha/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_condition(node_id, meta_src, predicate_binding_id)
           VALUES (?, ?, ?)`,
        )
        .run(100, "alpha/meta", 13)

      database
        .query(
          `INSERT INTO matter_meta(node_id, meta_src, src_binding_id, fields_binding_id, mass_binding_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(101, "alpha/meta", 10, 11, 12)

      database
        .query(
          `INSERT INTO matter_logical(node_id, meta_src, predicate_binding_id)
           VALUES (?, ?, ?)`,
        )
        .run(102, "alpha/meta", 14)

      database
        .query(
          `INSERT INTO matter_map(node_id, meta_src, collection_binding_id)
           VALUES (?, ?, ?)`,
        )
        .run(103, "alpha/meta", 15)

      database
        .query(
          `INSERT INTO matter_meta(node_id, meta_src, src_binding_id, fields_binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(104, "alpha/meta", 22, 23)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(200, "alpha/meta", null, 100, "root", 0)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(201, "alpha/meta", 100, 101, "then", 0)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(202, "alpha/meta", 100, 102, "else", 1)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(203, "alpha/meta", 102, 103, "child", 0)

      database
        .query(
          `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(204, "alpha/meta", 103, 104, "child", 0)

      database
        .query(
          `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(300, "alpha/meta", 101, "string", "title")

      database
        .query(
          `INSERT INTO matter_attr_binding(owner_attr_id, meta_src, attr_family, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(300, "alpha/meta", "string", 16)

      database
        .query(
          `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(301, "alpha/meta", 101, "boolean", "hidden")

      database
        .query(
          `INSERT INTO matter_attr_binding(owner_attr_id, meta_src, attr_family, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(301, "alpha/meta", "boolean", 17)

      database
        .query(
          `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(302, "alpha/meta", 101, "array", "class")

      database
        .query(
          `INSERT INTO matter_attr_part(owner_attr_id, meta_src, part_order, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(302, "alpha/meta", 0, 18)

      database
        .query(
          `INSERT INTO matter_attr_part(owner_attr_id, meta_src, part_order, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(302, "alpha/meta", 1, 19)

      database
        .query(
          `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(303, "alpha/meta", 101, "style", "style")

      database
        .query(
          `INSERT INTO matter_style_prop(owner_attr_id, meta_src, prop_name, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(303, "alpha/meta", "backgroundColor", 20)

      database
        .query(
          `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(304, "alpha/meta", 101, "event", "onclick")

      database
        .query(
          `INSERT INTO matter_attr_binding(owner_attr_id, meta_src, attr_family, binding_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(304, "alpha/meta", "event", 21)

      database
        .query(
          `INSERT INTO matter_event_update(owner_attr_id, meta_src, update_order, field_key)
           VALUES (?, ?, ?, ?)`,
        )
        .run(304, "alpha/meta", 0, "title")

      database
        .query(
          `INSERT INTO matter_event_update(owner_attr_id, meta_src, update_order, field_key)
           VALUES (?, ?, ?, ?)`,
        )
        .run(304, "alpha/meta", 1, "active")

      const nodes = (
        database
          .query(
            `SELECT id, node_kind, tag
             FROM matter_node
             ORDER BY id`,
          )
          .all() as Array<{ id: number; node_kind: string; tag: string | null }>
      )

      const edges = (
        database
          .query(
            `SELECT parent_node_id, child_node_id, edge_slot, edge_order
             FROM matter_edge
             ORDER BY id`,
          )
          .all() as Array<{
            parent_node_id: number | null
            child_node_id: number
            edge_slot: string
            edge_order: number
          }>
      )

      const deps = (
        database
          .query(
            `SELECT binding_id, dep_order, path
             FROM matter_binding_dep
             ORDER BY binding_id, dep_order`,
          )
          .all() as Array<{ binding_id: number; dep_order: number; path: string }>
      )

      const eventUpdates = (
        database
          .query(
            `SELECT update_order, field_key
             FROM matter_event_update
             WHERE owner_attr_id = ?
             ORDER BY update_order`,
          )
          .all(304) as Array<{ update_order: number; field_key: string }>
      )

      expect(nodes).toEqual([
        { id: 100, node_kind: "cond", tag: null },
        { id: 101, node_kind: "meta", tag: "meta-for" },
        { id: 102, node_kind: "log", tag: null },
        { id: 103, node_kind: "map", tag: null },
        { id: 104, node_kind: "meta", tag: "meta-for" },
      ])

      expect(edges).toEqual([
        { parent_node_id: null, child_node_id: 100, edge_slot: "root", edge_order: 0 },
        { parent_node_id: 100, child_node_id: 101, edge_slot: "then", edge_order: 0 },
        { parent_node_id: 100, child_node_id: 102, edge_slot: "else", edge_order: 1 },
        { parent_node_id: 102, child_node_id: 103, edge_slot: "child", edge_order: 0 },
        { parent_node_id: 103, child_node_id: 104, edge_slot: "child", edge_order: 0 },
      ])

      expect(deps).toEqual([
        { binding_id: 11, dep_order: 0, path: "/value/title" },
        { binding_id: 11, dep_order: 1, path: "/value/active" },
        { binding_id: 12, dep_order: 0, path: "/mass/owner" },
        { binding_id: 12, dep_order: 1, path: "/mass/enabled" },
        { binding_id: 13, dep_order: 0, path: "/state" },
        { binding_id: 14, dep_order: 0, path: "/value/active" },
        { binding_id: 14, dep_order: 1, path: "/mass/is-enabled" },
        { binding_id: 15, dep_order: 0, path: "/mass/items" },
        { binding_id: 16, dep_order: 0, path: "/value/title" },
        { binding_id: 19, dep_order: 0, path: "/value/active" },
        { binding_id: 20, dep_order: 0, path: "/value/active" },
        { binding_id: 21, dep_order: 0, path: "/mass/handleClick" },
        { binding_id: 22, dep_order: 0, path: "[item]/src" },
      ])

      expect(eventUpdates).toEqual([
        { update_order: 0, field_key: "title" },
        { update_order: 1, field_key: "active" },
      ])

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(205, "alpha/meta", 100, 104, "child", 2),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(id, meta_src, parent_node_id, child_node_id, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(206, "alpha/meta", 100, 104, "then", 2),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_attr(id, meta_src, owner_node_id, attr_family, attr_name)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(305, "alpha/meta", 100, "string", "invalid"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
             VALUES (?, ?, ?, ?)`,
          )
          .run(10, "alpha/meta", 0, "/value/forbidden"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_binding_dep(binding_id, meta_src, dep_order, path)
             VALUES (?, ?, ?, ?)`,
          )
          .run(13, "alpha/meta", 1, "/value/second"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_event_update(owner_attr_id, meta_src, update_order, field_key)
             VALUES (?, ?, ?, ?)`,
          )
          .run(304, "alpha/meta", 2, "missing"),
      ).toThrow()
    } finally {
      database.close()
    }
  })
})
