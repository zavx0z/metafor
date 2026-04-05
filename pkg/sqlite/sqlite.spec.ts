import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import {initializeMetaforDslSqliteSchema, metaforDslIndexNames, metaforDslTableNames} from "./sqlite.ts"

const openDatabase = (): Database => {
  const database = new Database(":memory:")
  initializeMetaforDslSqliteSchema(database)
  return database
}

describe("sqlite ddl", () => {
  test("создаёт meta-level таблицы и индексы из sql-модулей dsl без trigger-слоя", () => {
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

      const triggers = (
        database
          .query(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'trigger'
             ORDER BY name`,
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(tables).toEqual([...metaforDslTableNames].sort())
      expect(indexes).toEqual([...metaforDslIndexNames].sort())
      expect(triggers).toEqual([])
    } finally {
      database.close()
    }
  })

  test("держит entity-таблицы на uuid и child/subtype tables без parent-derived дублей", () => {
    const database = openDatabase()

    try {
      const fieldColumns = (database.query(`PRAGMA table_info(field)`).all() as Array<{ name: string }>).map((row) => row.name)
      const fieldDefaultColumns = (
        database.query(`PRAGMA table_info(field_default)`).all() as Array<{ name: string }>
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

      const superpositionColumns = (
        database.query(`PRAGMA table_info(superposition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const transitionColumns = (
        database.query(`PRAGMA table_info(transition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const conditionColumns = (
        database.query(`PRAGMA table_info(condition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const conditionPredicateColumns = (
        database.query(`PRAGMA table_info(condition_predicate)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const conditionListItemColumns = (
        database.query(`PRAGMA table_info(condition_list_item)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const processEnvColumns = (
        database.query(`PRAGMA table_info(process_env)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const processActionColumns = (
        database.query(`PRAGMA table_info(process_action)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const processFinallyColumns = (
        database.query(`PRAGMA table_info(process_finally)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const reactionSuperpositionColumns = (
        database.query(`PRAGMA table_info(reaction_superposition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      const matterEdgeColumns = (
        database.query(`PRAGMA table_info(matter_edge)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const matterMetaColumns = (
        database.query(`PRAGMA table_info(matter_meta)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const matterAttrColumns = (
        database.query(`PRAGMA table_info(matter_attr)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const matterEventUpdateColumns = (
        database.query(`PRAGMA table_info(matter_event_update)`).all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(fieldColumns).toEqual(["uuid", "meta", "key", "type", "required", "label"])
      expect(fieldDefaultColumns).toEqual(["field"])
      expect(fieldArrayItemColumns).toEqual(["uuid", "field", "position"])
      expect(fieldEnumVariantColumns).toEqual(["uuid", "field", "position"])
      expect(fieldEnumDefaultColumns).toEqual(["field", "variant"])

      expect(superpositionColumns).toEqual(["uuid", "meta", "name", "position"])
      expect(transitionColumns).toEqual(["uuid", "from_superposition", "to_superposition", "position"])
      expect(conditionColumns).toEqual(["uuid", "transition", "field", "position"])
      expect(conditionPredicateColumns).toEqual([
        "uuid",
        "condition",
        "predicate_order",
        "subject_kind",
        "operator",
        "value_kind",
        "value_boolean",
        "value_number",
        "value_text",
        "value_variant",
      ])
      expect(conditionListItemColumns).toEqual([
        "predicate",
        "item_order",
        "value_kind",
        "value_boolean",
        "value_number",
        "value_text",
        "value_variant",
      ])

      expect(processEnvColumns).toEqual(["process", "env"])
      expect(processActionColumns).toEqual(["process", "action", "action_import_specifier", "success", "error"])
      expect(processFinallyColumns).toEqual(["process", "before"])
      expect(reactionSuperpositionColumns).toEqual(["reaction", "superposition"])

      expect(matterEdgeColumns).toEqual(["uuid", "root_meta", "parent_node", "child_node", "edge_slot", "edge_order"])
      expect(matterMetaColumns).toEqual(["node", "src_binding", "fields_binding", "mass_binding"])
      expect(matterAttrColumns).toEqual(["uuid", "owner_node", "attr_family", "attr_name"])
      expect(matterEventUpdateColumns).toEqual(["attr", "update_order", "field"])
    } finally {
      database.close()
    }
  })

  test("держит только structural constraints через FK UNIQUE CHECK", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:title", "alpha/meta", "title", "string", 1)

      expect(() =>
        database
          .query(
            `INSERT INTO field(uuid, meta, key, type, required)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run("field:dup-key", "alpha/meta", "title", "string", 1),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO field(uuid, meta, key, type, required)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run("field:bad-required", "alpha/meta", "bad", "string", 2),
      ).toThrow()

      expect(() =>
        database.query(`INSERT INTO field_default(field) VALUES (?)`).run("field:missing"),
      ).toThrow()

      database.query(`INSERT INTO field_default(field) VALUES (?)`).run("field:title")
      database.query(`INSERT INTO field_string_default(field, default_value) VALUES (?, ?)`).run("field:title", "draft")

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:items", "alpha/meta", "items", "array<string>", 1)

      database.query(`INSERT INTO field_default(field) VALUES (?)`).run("field:items")
      database.query(`INSERT INTO field_array_default(field) VALUES (?)`).run("field:items")

      database
        .query(
          `INSERT INTO field_array_default_item(uuid, field, position)
           VALUES (?, ?, ?)`,
        )
        .run("item:0", "field:items", 0)

      expect(() =>
        database
          .query(
            `INSERT INTO field_array_default_item(uuid, field, position)
             VALUES (?, ?, ?)`,
          )
          .run("item:0-dup", "field:items", 0),
      ).toThrow()

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:status", "alpha/meta", "status", "enum<string>", 1)

      database
        .query(
          `INSERT INTO field_enum_variant(uuid, field, position)
           VALUES (?, ?, ?)`,
        )
        .run("variant:open", "field:status", 0)

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_variant(uuid, field, position)
             VALUES (?, ?, ?)`,
          )
          .run("variant:open-dup", "field:status", 0),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO reaction(uuid, meta, key, label, cond_source, update_source)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("reaction:missing-meta", "missing/meta", "refresh", "Refresh", "() => true", "() => ({})"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("не дублирует semantic validation триггерами и допускает structurally-valid rows", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:alpha:title", "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:title", "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:tags", "beta/meta", "tags", "array<string>", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:status", "beta/meta", "status", "enum<string>", 1)

      database
        .query(
          `INSERT INTO field_enum_variant(uuid, field, position)
           VALUES (?, ?, ?)`,
        )
        .run("variant:open", "field:beta:status", 0)

      database
        .query(
          `INSERT INTO field_enum_variant(uuid, field, position)
           VALUES (?, ?, ?)`,
        )
        .run("variant:closed", "field:beta:status", 1)

      database
        .query(
          `INSERT INTO superposition(uuid, meta, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("state:alpha", "alpha/meta", "idle", 0)

      database
        .query(
          `INSERT INTO superposition(uuid, meta, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("state:beta", "beta/meta", "idle", 0)

      database
        .query(
          `INSERT INTO transition(uuid, from_superposition, to_superposition, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("transition:cross", "state:alpha", "state:beta", 0)

      database
        .query(
          `INSERT INTO condition(uuid, transition, field, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("condition:tags", "transition:cross", "field:beta:tags", 0)

      database
        .query(
          `INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_number)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("predicate:tags:length", "condition:tags", 0, "length", "gte", "number", 2)

      expect(() =>
        database
          .query(
            `INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_number)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run("predicate:tags:length-op", "condition:tags", 2, "length", "length", "number", 2),
      ).toThrow()

      database
        .query(
          `INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_text)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("predicate:tags:include", "condition:tags", 1, "value", "include", "string", "urgent")

      database
        .query(
          `INSERT INTO condition(uuid, transition, field, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("condition:status", "transition:cross", "field:beta:status", 1)

      database
        .query(
          `INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_variant)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("predicate:status:eq", "condition:status", 0, "value", "eq", "enum", "variant:open")

      database
        .query(
          `INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("predicate:status:in", "condition:status", 1, "value", "in", "list")

      database
        .query(
          `INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
           VALUES (?, ?, ?, ?)`,
        )
        .run("predicate:status:in", 0, "enum", "variant:open")

      database
        .query(
          `INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
           VALUES (?, ?, ?, ?)`,
        )
        .run("predicate:status:in", 1, "enum", "variant:closed")

      database
        .query(`DELETE FROM field_enum_variant WHERE uuid = ?`)
        .run("variant:closed")

      const predicateAfterEnumDelete = (
        database.query(`SELECT COUNT(*) as count FROM condition_predicate WHERE uuid = ?`).get("predicate:status:in") as { count: number }
      )
      const listItemAfterEnumDelete = (
        database.query(`SELECT COUNT(*) as count FROM condition_list_item WHERE predicate = ?`).get("predicate:status:in") as { count: number }
      )

      expect(predicateAfterEnumDelete.count).toBe(1)
      expect(listItemAfterEnumDelete.count).toBe(1)

      database
        .query(
          `INSERT INTO process(uuid, meta, key, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run("process:finally", "alpha/meta", "cleanup", "finally")

      database
        .query(
          `INSERT INTO process_action(process, action)
           VALUES (?, ?)`,
        )
        .run("process:finally", "src/action.ts")

      database
        .query(
          `INSERT INTO process_action_read(process, field, phase)
           VALUES (?, ?, ?)`,
        )
        .run("process:finally", "field:beta:title", "action")

      database
        .query(
          `INSERT INTO reaction(uuid, meta, key, label, cond_source, update_source)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("reaction:alpha", "alpha/meta", "refresh", "Refresh", "() => true", "() => ({})")

      database
        .query(
          `INSERT INTO reaction_superposition(reaction, superposition)
           VALUES (?, ?)`,
        )
        .run("reaction:alpha", "state:beta")

      database
        .query(
          `INSERT INTO reaction_write(reaction, field)
           VALUES (?, ?)`,
        )
        .run("reaction:alpha", "field:beta:title")

      const transitionCount = database.query(`SELECT COUNT(*) as count FROM transition`).get() as { count: number }
      const processActionCount = database.query(`SELECT COUNT(*) as count FROM process_action`).get() as { count: number }
      const reactionWriteCount = database.query(`SELECT COUNT(*) as count FROM reaction_write`).get() as { count: number }

      expect(transitionCount.count).toBe(1)
      const conditionCount = database.query(`SELECT COUNT(*) as count FROM condition`).get() as { count: number }
      const predicateCount = database.query(`SELECT COUNT(*) as count FROM condition_predicate`).get() as { count: number }
      const listItemCount = database.query(`SELECT COUNT(*) as count FROM condition_list_item`).get() as { count: number }
      expect(processActionCount.count).toBe(1)
      expect(conditionCount.count).toBe(2)
      expect(predicateCount.count).toBe(4)
      expect(listItemCount.count).toBe(1)
      expect(reactionWriteCount.count).toBe(1)
    } finally {
      database.close()
    }
  })

  test("хранит matter как structural rows без semantic trigger-guards", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:alpha:title", "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:title", "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("binding:src", "alpha/meta", "static", "text", "alpha/root")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run("binding:predicate", "beta/meta", "variable")

      database
        .query(
          `INSERT INTO matter_node(uuid, meta, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:alpha:cond", "alpha/meta", "cond", null)

      database
        .query(
          `INSERT INTO matter_node(uuid, meta, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:beta:meta", "beta/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_condition(node, predicate_binding)
           VALUES (?, ?)`,
        )
        .run("node:alpha:cond", "binding:predicate")

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta, parent_node, child_node, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:root", "alpha/meta", null, "node:alpha:cond", "root", 0)

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta, parent_node, child_node, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:cross", null, "node:alpha:cond", "node:beta:meta", "child", 0)

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:event", "node:alpha:cond", "event", "onclick")

      database
        .query(
          `INSERT INTO matter_attr_binding(attr, binding)
           VALUES (?, ?)`,
        )
        .run("attr:event", "binding:src")

      database
        .query(
          `INSERT INTO matter_event_update(attr, update_order, field)
           VALUES (?, ?, ?)`,
        )
        .run("attr:event", 0, "field:beta:title")

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(uuid, root_meta, parent_node, child_node, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("edge:bad-check", null, null, "node:beta:meta", "root", 1),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(uuid, root_meta, parent_node, child_node, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("edge:dup-child", "beta/meta", null, "node:beta:meta", "root", 0),
      ).toThrow()

      const edgeCount = database.query(`SELECT COUNT(*) as count FROM matter_edge`).get() as { count: number }
      const attrCount = database.query(`SELECT COUNT(*) as count FROM matter_attr`).get() as { count: number }

      expect(edgeCount.count).toBe(2)
      expect(attrCount.count).toBe(1)
    } finally {
      database.close()
    }
  })
})
