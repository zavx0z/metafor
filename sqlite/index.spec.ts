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

      const stateColumns = (database.query(`PRAGMA table_info(state)`).all() as Array<{ name: string }>).map((row) => row.name)
      const transitionColumns = (
        database.query(`PRAGMA table_info(transition)`).all() as Array<{ name: string }>
      ).map((row) => row.name)
      const conditionColumns = (
        database.query(`PRAGMA table_info(condition)`).all() as Array<{ name: string }>
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
      const reactionStateColumns = (
        database.query(`PRAGMA table_info(reaction_state)`).all() as Array<{ name: string }>
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

      expect(fieldColumns).toEqual(["uuid", "meta_src", "key", "type", "required", "label"])
      expect(fieldDefaultColumns).toEqual(["field_uuid"])
      expect(fieldArrayItemColumns).toEqual(["uuid", "field_uuid", "position"])
      expect(fieldEnumVariantColumns).toEqual(["uuid", "field_uuid", "position"])
      expect(fieldEnumDefaultColumns).toEqual(["field_uuid", "variant_uuid"])

      expect(stateColumns).toEqual(["uuid", "meta_src", "name", "position"])
      expect(transitionColumns).toEqual(["uuid", "from_state_uuid", "to_state_uuid", "position"])
      expect(conditionColumns).toEqual(["transition_uuid", "field_uuid", "condition_json"])

      expect(processEnvColumns).toEqual(["process_uuid", "env"])
      expect(processActionColumns).toEqual([
        "process_uuid",
        "action_src",
        "action_import_specifier",
        "success_src",
        "error_src",
      ])
      expect(processFinallyColumns).toEqual(["process_uuid", "before_src"])
      expect(reactionStateColumns).toEqual(["reaction_uuid", "state_uuid"])

      expect(matterEdgeColumns).toEqual([
        "uuid",
        "root_meta_src",
        "parent_node_uuid",
        "child_node_uuid",
        "edge_slot",
        "edge_order",
      ])
      expect(matterMetaColumns).toEqual(["node_uuid", "src_binding_uuid", "fields_binding_uuid", "mass_binding_uuid"])
      expect(matterAttrColumns).toEqual(["uuid", "owner_node_uuid", "attr_family", "attr_name"])
      expect(matterEventUpdateColumns).toEqual(["attr_uuid", "update_order", "field_uuid"])
    } finally {
      database.close()
    }
  })

  test("режет невалидные field defaults и удерживает enum/array subtype-типизацию через parent uuid", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?)`).run("alpha/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:items", "alpha/meta", "items", "array<string>", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:maybe-title", "alpha/meta", "maybeTitle", "string", 0)

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:status", "alpha/meta", "status", "enum<string>", 1)

      expect(() => database.query(`INSERT INTO field_default(field_uuid) VALUES (?)`).run("field:maybe-title")).toThrow()

      database.query(`INSERT INTO field_default(field_uuid) VALUES (?)`).run("field:items")
      database.query(`INSERT INTO field_array_default(field_uuid) VALUES (?)`).run("field:items")

      database
        .query(
          `INSERT INTO field_array_default_item(uuid, field_uuid, position)
           VALUES (?, ?, ?)`,
        )
        .run("item:0", "field:items", 0)

      database
        .query(
          `INSERT INTO field_array_string_default_item(item_uuid, item_value)
           VALUES (?, ?)`,
        )
        .run("item:0", "draft")

      expect(() =>
        database
          .query(
            `INSERT INTO field_array_number_default_item(item_uuid, item_value)
             VALUES (?, ?)`,
          )
          .run("item:0", 1),
      ).toThrow()

      database.query(`INSERT INTO field_default(field_uuid) VALUES (?)`).run("field:status")

      database
        .query(
          `INSERT INTO field_enum_variant(uuid, field_uuid, position)
           VALUES (?, ?, ?)`,
        )
        .run("variant:open", "field:status", 0)

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_uuid, item_value)
           VALUES (?, ?)`,
        )
        .run("variant:open", "open")

      database
        .query(
          `INSERT INTO field_enum_variant(uuid, field_uuid, position)
           VALUES (?, ?, ?)`,
        )
        .run("variant:closed", "field:status", 1)

      database
        .query(
          `INSERT INTO field_enum_string_variant(variant_uuid, item_value)
           VALUES (?, ?)`,
        )
        .run("variant:closed", "closed")

      database
        .query(
          `INSERT INTO field_enum_default(field_uuid, variant_uuid)
           VALUES (?, ?)`,
        )
        .run("field:status", "variant:open")

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_variant(uuid, field_uuid, position)
             VALUES (?, ?, ?)`,
          )
          .run("variant:status-dup", "field:status", 2),
      ).not.toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_string_variant(variant_uuid, item_value)
             VALUES (?, ?)`,
          )
          .run("variant:status-dup", "open"),
      ).toThrow()

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:kind", "alpha/meta", "kind", "enum<string>", 1)

      database.query(`INSERT INTO field_default(field_uuid) VALUES (?)`).run("field:kind")

      expect(() =>
        database
          .query(
            `INSERT INTO field_enum_default(field_uuid, variant_uuid)
             VALUES (?, ?)`,
          )
          .run("field:kind", "variant:open"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает ownership-модель для transition, process и reaction без дублирования meta_src в relation tables", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:alpha:title", "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:title", "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO state(uuid, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("state:alpha:idle", "alpha/meta", "idle", 0)

      database
        .query(
          `INSERT INTO state(uuid, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("state:alpha:done", "alpha/meta", "done", 1)

      database
        .query(
          `INSERT INTO state(uuid, meta_src, name, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("state:beta:idle", "beta/meta", "idle", 0)

      database
        .query(
          `INSERT INTO transition(uuid, from_state_uuid, to_state_uuid, position)
           VALUES (?, ?, ?, ?)`,
        )
        .run("transition:alpha", "state:alpha:idle", "state:alpha:done", 0)

      expect(() =>
        database
          .query(
            `INSERT INTO transition(uuid, from_state_uuid, to_state_uuid, position)
             VALUES (?, ?, ?, ?)`,
          )
          .run("transition:cross", "state:alpha:idle", "state:beta:idle", 1),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO condition(transition_uuid, field_uuid, condition_json)
             VALUES (?, ?, ?)`,
          )
          .run("transition:alpha", "field:beta:title", JSON.stringify({ eq: "x" })),
      ).toThrow()

      database
        .query(
          `INSERT INTO process(uuid, meta_src, key, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run("process:action", "alpha/meta", "load", "action")

      database
        .query(
          `INSERT INTO process(uuid, meta_src, key, type)
           VALUES (?, ?, ?, ?)`,
        )
        .run("process:finally", "alpha/meta", "cleanup", "finally")

      database
        .query(
          `INSERT INTO process_env(process_uuid, env)
           VALUES (?, ?)`,
        )
        .run("process:action", "worker")

      database
        .query(
          `INSERT INTO process_action(process_uuid, action_src)
           VALUES (?, ?)`,
        )
        .run("process:action", "src/action.ts")

      database
        .query(
          `INSERT INTO process_finally(process_uuid, before_src)
           VALUES (?, ?)`,
        )
        .run("process:finally", "src/finally.ts")

      expect(() =>
        database
          .query(
            `INSERT INTO process_action(process_uuid, action_src)
             VALUES (?, ?)`,
          )
          .run("process:finally", "src/wrong.ts"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO process_finally(process_uuid, before_src)
             VALUES (?, ?)`,
          )
          .run("process:action", "src/wrong.ts"),
      ).toThrow()

      database
        .query(
          `INSERT INTO process_action_read(process_uuid, field_uuid, phase)
           VALUES (?, ?, ?)`,
        )
        .run("process:action", "field:alpha:title", "action")

      expect(() =>
        database
          .query(
            `INSERT INTO process_action_write(process_uuid, field_uuid, phase)
             VALUES (?, ?, ?)`,
          )
          .run("process:action", "field:beta:title", "success"),
      ).toThrow()

      database
        .query(
          `INSERT INTO process_finally_read(process_uuid, field_uuid)
           VALUES (?, ?)`,
        )
        .run("process:finally", "field:alpha:title")

      expect(() =>
        database
          .query(
            `INSERT INTO process_finally_read(process_uuid, field_uuid)
             VALUES (?, ?)`,
          )
          .run("process:finally", "field:beta:title"),
      ).toThrow()

      database
        .query(
          `INSERT INTO reaction(uuid, meta_src, key, label, cond_source, update_source)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("reaction:refresh", "alpha/meta", "refresh", "Refresh", "() => true", "() => ({})")

      database
        .query(
          `INSERT INTO reaction_state(reaction_uuid, state_uuid)
           VALUES (?, ?)`,
        )
        .run("reaction:refresh", "state:alpha:idle")

      database
        .query(
          `INSERT INTO reaction_read(reaction_uuid, field_uuid)
           VALUES (?, ?)`,
        )
        .run("reaction:refresh", "field:alpha:title")

      expect(() =>
        database
          .query(
            `INSERT INTO reaction_write(reaction_uuid, field_uuid)
             VALUES (?, ?)`,
          )
          .run("reaction:refresh", "field:beta:title"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO reaction_state(reaction_uuid, state_uuid)
             VALUES (?, ?)`,
          )
          .run("reaction:refresh", "state:beta:idle"),
      ).toThrow()
    } finally {
      database.close()
    }
  })

  test("удерживает matter AST на uuid и owner-based topology без потери связей и зависимостей", () => {
    const database = openDatabase()

    try {
      database.query(`INSERT INTO meta(src) VALUES (?), (?)`).run("alpha/meta", "beta/meta")

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:alpha:title", "alpha/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:alpha:active", "alpha/meta", "active", "boolean", 1)

      database
        .query(
          `INSERT INTO field(uuid, meta_src, key, type, required)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("field:beta:title", "beta/meta", "title", "string", 1)

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("binding:src", "alpha/meta", "static", "text", "alpha/root")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:fields", "alpha/meta", "dynamic", "{ title: _[0], active: _[1] }")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:fields", 0, "/value/title")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:fields", 1, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:mass", "alpha/meta", "dynamic", "{ owner: _[0], enabled: _[1] }")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:mass", 0, "/mass/owner")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:mass", 1, "/mass/enabled")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run("binding:cond", "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:cond", 0, "/state")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:log", "alpha/meta", "dynamic", "${_[0]} && ${_[1]}")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:log", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:log", 1, "/mass/is-enabled")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run("binding:map", "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:map", 0, "/mass/items")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run("binding:attr:title", "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:attr:title", 0, "/value/title")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, literal_kind, literal_boolean)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("binding:attr:hidden", "alpha/meta", "static", "boolean", 1)

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("binding:class:static", "alpha/meta", "static", "text", "card")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:class:dynamic", "alpha/meta", "dynamic", "${_[0]} ? 'active' : 'idle'")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:class:dynamic", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:style", "alpha/meta", "dynamic", "${_[0]} ? 'green' : 'red'")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:style", 0, "/value/active")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, expr)
           VALUES (?, ?, ?, ?)`,
        )
        .run("binding:event", "alpha/meta", "dynamic", "(event) => _[0](event)")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:event", 0, "/mass/handleClick")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind)
           VALUES (?, ?, ?)`,
        )
        .run("binding:item:src", "alpha/meta", "variable")

      database
        .query(
          `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
           VALUES (?, ?, ?)`,
        )
        .run("binding:item:src", 0, "[item]/src")

      database
        .query(
          `INSERT INTO matter_binding(uuid, meta_src, binding_kind, literal_kind, literal_text)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("binding:item:fields", "alpha/meta", "static", "text", '{ role: "item" }')

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:cond", "alpha/meta", "cond", null)

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:meta", "alpha/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:log", "alpha/meta", "log", null)

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:map", "alpha/meta", "map", null)

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:item-meta", "alpha/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_node(uuid, meta_src, node_kind, tag)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:beta-meta", "beta/meta", "meta", "meta-for")

      database
        .query(
          `INSERT INTO matter_condition(node_uuid, predicate_binding_uuid)
           VALUES (?, ?)`,
        )
        .run("node:cond", "binding:cond")

      database
        .query(
          `INSERT INTO matter_meta(node_uuid, src_binding_uuid, fields_binding_uuid, mass_binding_uuid)
           VALUES (?, ?, ?, ?)`,
        )
        .run("node:meta", "binding:src", "binding:fields", "binding:mass")

      database
        .query(
          `INSERT INTO matter_logical(node_uuid, predicate_binding_uuid)
           VALUES (?, ?)`,
        )
        .run("node:log", "binding:log")

      database
        .query(
          `INSERT INTO matter_map(node_uuid, collection_binding_uuid)
           VALUES (?, ?)`,
        )
        .run("node:map", "binding:map")

      database
        .query(
          `INSERT INTO matter_meta(node_uuid, src_binding_uuid, fields_binding_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("node:item-meta", "binding:item:src", "binding:item:fields")

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:root", "alpha/meta", null, "node:cond", "root", 0)

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:then", null, "node:cond", "node:meta", "then", 0)

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:else", null, "node:cond", "node:log", "else", 1)

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:log-child", null, "node:log", "node:map", "child", 0)

      database
        .query(
          `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("edge:map-child", null, "node:map", "node:item-meta", "child", 0)

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:title", "node:meta", "string", "title")

      database
        .query(
          `INSERT INTO matter_attr_binding(attr_uuid, binding_uuid)
           VALUES (?, ?)`,
        )
        .run("attr:title", "binding:attr:title")

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:hidden", "node:meta", "boolean", "hidden")

      database
        .query(
          `INSERT INTO matter_attr_binding(attr_uuid, binding_uuid)
           VALUES (?, ?)`,
        )
        .run("attr:hidden", "binding:attr:hidden")

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:class", "node:meta", "array", "class")

      database
        .query(
          `INSERT INTO matter_attr_part(attr_uuid, part_order, binding_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("attr:class", 0, "binding:class:static")

      database
        .query(
          `INSERT INTO matter_attr_part(attr_uuid, part_order, binding_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("attr:class", 1, "binding:class:dynamic")

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:style", "node:meta", "style", "style")

      database
        .query(
          `INSERT INTO matter_style_prop(attr_uuid, prop_name, binding_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("attr:style", "backgroundColor", "binding:style")

      database
        .query(
          `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
           VALUES (?, ?, ?, ?)`,
        )
        .run("attr:event", "node:meta", "event", "onclick")

      database
        .query(
          `INSERT INTO matter_attr_binding(attr_uuid, binding_uuid)
           VALUES (?, ?)`,
        )
        .run("attr:event", "binding:event")

      database
        .query(
          `INSERT INTO matter_event_update(attr_uuid, update_order, field_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("attr:event", 0, "field:alpha:title")

      database
        .query(
          `INSERT INTO matter_event_update(attr_uuid, update_order, field_uuid)
           VALUES (?, ?, ?)`,
        )
        .run("attr:event", 1, "field:alpha:active")

      const edges = (
        database
          .query(
            `SELECT uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order
             FROM matter_edge
             ORDER BY uuid`,
          )
          .all() as Array<{
            uuid: string
            root_meta_src: string | null
            parent_node_uuid: string | null
            child_node_uuid: string
            edge_slot: string
            edge_order: number
          }>
      )

      const deps = (
        database
          .query(
            `SELECT binding_uuid, dep_order, path
             FROM matter_binding_dep
             ORDER BY binding_uuid, dep_order`,
          )
          .all() as Array<{ binding_uuid: string; dep_order: number; path: string }>
      )

      const eventUpdates = (
        database
          .query(
            `SELECT update_order, field_uuid
             FROM matter_event_update
             WHERE attr_uuid = ?
             ORDER BY update_order`,
          )
          .all("attr:event") as Array<{ update_order: number; field_uuid: string }>
      )

      expect(edges).toEqual([
        {
          uuid: "edge:else",
          root_meta_src: null,
          parent_node_uuid: "node:cond",
          child_node_uuid: "node:log",
          edge_slot: "else",
          edge_order: 1,
        },
        {
          uuid: "edge:log-child",
          root_meta_src: null,
          parent_node_uuid: "node:log",
          child_node_uuid: "node:map",
          edge_slot: "child",
          edge_order: 0,
        },
        {
          uuid: "edge:map-child",
          root_meta_src: null,
          parent_node_uuid: "node:map",
          child_node_uuid: "node:item-meta",
          edge_slot: "child",
          edge_order: 0,
        },
        {
          uuid: "edge:root",
          root_meta_src: "alpha/meta",
          parent_node_uuid: null,
          child_node_uuid: "node:cond",
          edge_slot: "root",
          edge_order: 0,
        },
        {
          uuid: "edge:then",
          root_meta_src: null,
          parent_node_uuid: "node:cond",
          child_node_uuid: "node:meta",
          edge_slot: "then",
          edge_order: 0,
        },
      ])

      expect(deps).toEqual([
        { binding_uuid: "binding:attr:title", dep_order: 0, path: "/value/title" },
        { binding_uuid: "binding:class:dynamic", dep_order: 0, path: "/value/active" },
        { binding_uuid: "binding:cond", dep_order: 0, path: "/state" },
        { binding_uuid: "binding:event", dep_order: 0, path: "/mass/handleClick" },
        { binding_uuid: "binding:fields", dep_order: 0, path: "/value/title" },
        { binding_uuid: "binding:fields", dep_order: 1, path: "/value/active" },
        { binding_uuid: "binding:item:src", dep_order: 0, path: "[item]/src" },
        { binding_uuid: "binding:log", dep_order: 0, path: "/value/active" },
        { binding_uuid: "binding:log", dep_order: 1, path: "/mass/is-enabled" },
        { binding_uuid: "binding:map", dep_order: 0, path: "/mass/items" },
        { binding_uuid: "binding:mass", dep_order: 0, path: "/mass/owner" },
        { binding_uuid: "binding:mass", dep_order: 1, path: "/mass/enabled" },
        { binding_uuid: "binding:style", dep_order: 0, path: "/value/active" },
      ])

      expect(eventUpdates).toEqual([
        { update_order: 0, field_uuid: "field:alpha:title" },
        { update_order: 1, field_uuid: "field:alpha:active" },
      ])

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("edge:wrong-slot", null, "node:cond", "node:beta-meta", "child", 2),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_edge(uuid, root_meta_src, parent_node_uuid, child_node_uuid, edge_slot, edge_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run("edge:cross-meta", null, "node:map", "node:beta-meta", "child", 1),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_attr(uuid, owner_node_uuid, attr_family, attr_name)
             VALUES (?, ?, ?, ?)`,
          )
          .run("attr:invalid", "node:cond", "string", "bad"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
             VALUES (?, ?, ?)`,
          )
          .run("binding:src", 0, "/value/forbidden"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_binding_dep(binding_uuid, dep_order, path)
             VALUES (?, ?, ?)`,
          )
          .run("binding:cond", 1, "/value/second"),
      ).toThrow()

      expect(() =>
        database
          .query(
            `INSERT INTO matter_event_update(attr_uuid, update_order, field_uuid)
             VALUES (?, ?, ?)`,
          )
          .run("attr:event", 2, "field:beta:title"),
      ).toThrow()
    } finally {
      database.close()
    }
  })
})
