import { SQL } from "bun"
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { open, metaforDslIndexNames, metaforDslTableNames } from "./sqlite.ts"

describe("sqlite ddl", () => {
  let db: SQL

  beforeEach(async () => {
    db = await open(":memory:")
  })

  afterEach(async () => {
    if (db) {
      await db.close()
    }
  })

  test("создаёт meta-level таблицы и индексы из sql-модулей dsl без trigger-слоя", async () => {
    const tables = (
      (await db`SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                ORDER BY name`) as Array<{ name: string }>
    ).map((row) => row.name)

    const indexes = (
      (await db`SELECT name
                FROM sqlite_master
                WHERE type = 'index'
                  AND name NOT LIKE 'sqlite_autoindex%'
                ORDER BY name`) as Array<{ name: string }>
    ).map((row) => row.name)

    const triggers = (
      (await db`SELECT name
                FROM sqlite_master
                WHERE type = 'trigger'
                ORDER BY name`) as Array<{ name: string }>
    ).map((row) => row.name)

    expect(tables).toEqual([...metaforDslTableNames].sort())
    expect(indexes).toEqual([...metaforDslIndexNames].sort())
    expect(triggers).toEqual([])
  })

  test("держит entity-таблицы на uuid и child/subtype tables без parent-derived дублей", async () => {
    const metaColumns = ((await db.unsafe(`PRAGMA table_info(meta)`)) as Array<{ name: string }>).map((row) => row.name)
    const metaMassColumns = ((await db.unsafe(`PRAGMA table_info(meta_mass_value)`)) as Array<{ name: string }>).map((row) => row.name)
    const fieldColumns = ((await db.unsafe(`PRAGMA table_info(field)`)) as Array<{ name: string }>).map((row) => row.name)
    const fieldDefaultColumns = (
      (await db.unsafe(`PRAGMA table_info(field_default)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const fieldArrayItemColumns = (
      (await db.unsafe(`PRAGMA table_info(field_array_default_item)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const fieldEnumVariantColumns = (
      (await db.unsafe(`PRAGMA table_info(field_enum_variant)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const fieldEnumDefaultColumns = (
      (await db.unsafe(`PRAGMA table_info(field_enum_default)`)) as Array<{ name: string }>
    ).map((row) => row.name)

    const superpositionColumns = (
      (await db.unsafe(`PRAGMA table_info(superposition)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const transitionColumns = (
      (await db.unsafe(`PRAGMA table_info(transition)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const conditionColumns = (
      (await db.unsafe(`PRAGMA table_info(condition)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const conditionPredicateColumns = (
      (await db.unsafe(`PRAGMA table_info(condition_predicate)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const conditionListItemColumns = (
      (await db.unsafe(`PRAGMA table_info(condition_list_item)`)) as Array<{ name: string }>
    ).map((row) => row.name)

    const processEnvColumns = (
      (await db.unsafe(`PRAGMA table_info(process_env)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const processActionColumns = (
      (await db.unsafe(`PRAGMA table_info(process_action)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const processFinallyColumns = (
      (await db.unsafe(`PRAGMA table_info(process_finally)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const reactionSuperpositionColumns = (
      (await db.unsafe(`PRAGMA table_info(reaction_superposition)`)) as Array<{ name: string }>
    ).map((row) => row.name)

    const matterParticleColumns = (
      (await db.unsafe(`PRAGMA table_info(matter_particle)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const matterParticleWimpColumns = (
      (await db.unsafe(`PRAGMA table_info(matter_particle_wimp)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const matterParticleFuzzyColumns = (
      (await db.unsafe(`PRAGMA table_info(matter_particle_fuzzy)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const matterParticleAxionColumns = (
      (await db.unsafe(`PRAGMA table_info(matter_particle_axion)`)) as Array<{ name: string }>
    ).map((row) => row.name)
    const matterParticleMachoColumns = (
      (await db.unsafe(`PRAGMA table_info(matter_particle_macho)`)) as Array<{ name: string }>
    ).map((row) => row.name)

    expect(metaColumns).toEqual([
      "src",
      "name",
      "desc",
      "view_css",
    ])
    expect(metaMassColumns).toEqual([
      "uuid",
      "meta",
      "parent_value",
      "value_kind",
      "entry_key",
      "entry_order",
      "text_value",
      "number_value",
      "boolean_value",
    ])
    expect(fieldColumns).toEqual(["uuid", "meta", "key", "type", "required", "label"])
    expect(fieldDefaultColumns).toEqual(["field"])
    expect(fieldArrayItemColumns).toEqual(["uuid", "field", "position", "item_value"])
    expect(fieldEnumVariantColumns).toEqual(["uuid", "field", "position", "item_value"])
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
    expect(processActionColumns).toEqual([
      "process",
      "action",
      "action_import_specifier",
      "action_wrapper_src",
      "success",
      "error",
    ])
    expect(processFinallyColumns).toEqual(["process", "before"])
    expect(reactionSuperpositionColumns).toEqual(["reaction", "superposition"])

    expect(matterParticleColumns).toEqual(["uuid", "meta", "parent_particle", "particle_kind", "edge_slot", "particle_order"])
    expect(matterParticleWimpColumns).toEqual(["particle", "src", "fields_binding", "mass_binding"])
    expect(matterParticleFuzzyColumns).toEqual(["particle", "fuzzy_kind", "predicate_binding"])
    expect(matterParticleAxionColumns).toEqual(["particle", "predicate_binding"])
    expect(matterParticleMachoColumns).toEqual(["particle", "collection_binding"])
  })

  test("держит только structural constraints через FK UNIQUE CHECK", async () => {
    await db`INSERT INTO meta(src) VALUES (${"alpha/meta"})`

    await db`INSERT INTO meta_mass_value(uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
             VALUES (${"mass:root"}, ${"alpha/meta"}, ${null}, ${"object"}, ${null}, ${null}, ${null}, ${null}, ${null})`

    await expect(async () => {
      await db`INSERT INTO meta_mass_value(uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
               VALUES (${"mass:root:dup"}, ${"alpha/meta"}, ${null}, ${"object"}, ${null}, ${null}, ${null}, ${null}, ${null})`
    }).toThrow()

    await db`INSERT INTO meta_mass_value(uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
             VALUES (${"mass:title"}, ${"alpha/meta"}, ${"mass:root"}, ${"string"}, ${"title"}, ${null}, ${"draft"}, ${null}, ${null})`

    await expect(async () => {
      await db`INSERT INTO meta_mass_value(uuid, meta, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
               VALUES (${"mass:title:dup"}, ${"alpha/meta"}, ${"mass:root"}, ${"string"}, ${"title"}, ${null}, ${"copy"}, ${null}, ${null})`
    }).toThrow()

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:title"}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`

    await expect(async () => {
      await db`INSERT INTO field(uuid, meta, key, type, required)
               VALUES (${"field:dup-key"}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO field(uuid, meta, key, type, required)
               VALUES (${"field:bad-required"}, ${"alpha/meta"}, ${"bad"}, ${"string"}, ${2})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO field_default(field) VALUES (${"field:missing"})`
    }).toThrow()

    await db`INSERT INTO field_default(field) VALUES (${"field:title"})`
    await db`INSERT INTO field_string_default(field, default_value) VALUES (${"field:title"}, ${"draft"})`

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:items"}, ${"alpha/meta"}, ${"items"}, ${"array"}, ${1})`

    await db`INSERT INTO field_default(field) VALUES (${"field:items"})`

    await db`INSERT INTO field_array_default_item(uuid, field, position, item_value)
             VALUES (${crypto.randomUUID()}, ${"field:items"}, ${0}, ${"10"})`

    await expect(async () => {
      await db`INSERT INTO field_array_default_item(uuid, field, position, item_value)
               VALUES (${crypto.randomUUID()}, ${"field:items"}, ${0}, ${"20"})`
    }).toThrow()

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:status"}, ${"alpha/meta"}, ${"status"}, ${"enum"}, ${1})`

    await db`INSERT INTO field_enum_variant(uuid, field, position, item_value)
             VALUES (${"variant:open"}, ${"field:status"}, ${0}, ${"open"})`

    await expect(async () => {
      await db`INSERT INTO field_enum_variant(uuid, field, position, item_value)
               VALUES (${"variant:open-dup"}, ${"field:status"}, ${0}, ${"open-dup"})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO reaction(uuid, meta, key, label, cond_source, update_source)
               VALUES (${"reaction:missing-meta"}, ${"missing/meta"}, ${"refresh"}, ${"Refresh"}, ${"() => true"}, ${"() => ({})"})`
    }).toThrow()
  })

  test("не дублирует semantic validation триггерами и допускает structurally-valid rows", async () => {
    await db`INSERT INTO meta(src) VALUES (${"alpha/meta"}), (${"beta/meta"})`

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:alpha:title"}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:beta:title"}, ${"beta/meta"}, ${"title"}, ${"string"}, ${1})`

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:beta:tags"}, ${"beta/meta"}, ${"tags"}, ${"array"}, ${1})`

    await db`INSERT INTO field(uuid, meta, key, type, required)
             VALUES (${"field:beta:status"}, ${"beta/meta"}, ${"status"}, ${"enum"}, ${1})`

    await db`INSERT INTO field_enum_variant(uuid, field, position, item_value)
             VALUES (${"variant:open"}, ${"field:beta:status"}, ${0}, ${"open"})`

    await db`INSERT INTO field_enum_variant(uuid, field, position, item_value)
             VALUES (${"variant:closed"}, ${"field:beta:status"}, ${1}, ${"closed"})`

    await db`INSERT INTO superposition(uuid, meta, name, position)
             VALUES (${"state:alpha"}, ${"alpha/meta"}, ${"idle"}, ${0})`

    await db`INSERT INTO superposition(uuid, meta, name, position)
             VALUES (${"state:beta"}, ${"beta/meta"}, ${"idle"}, ${0})`

    await db`INSERT INTO transition(uuid, from_superposition, to_superposition, position)
             VALUES (${"transition:cross"}, ${"state:alpha"}, ${"state:beta"}, ${0})`

    await db`INSERT INTO condition(uuid, transition, field, position)
             VALUES (${"condition:tags"}, ${"transition:cross"}, ${"field:beta:tags"}, ${0})`

    await db`INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_number)
             VALUES (${"predicate:tags:length"}, ${"condition:tags"}, ${0}, ${"length"}, ${"gte"}, ${"number"}, ${2})`

    await expect(async () => {
      await db`INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_number)
               VALUES (${"predicate:tags:length-op"}, ${"condition:tags"}, ${2}, ${"length"}, ${"length"}, ${"number"}, ${2})`
    }).toThrow()

    await db`INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_text)
             VALUES (${"predicate:tags:include"}, ${"condition:tags"}, ${1}, ${"value"}, ${"include"}, ${"string"}, ${"urgent"})`

    await db`INSERT INTO condition(uuid, transition, field, position)
             VALUES (${"condition:status"}, ${"transition:cross"}, ${"field:beta:status"}, ${1})`

    await db`INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind, value_variant)
             VALUES (${"predicate:status:eq"}, ${"condition:status"}, ${0}, ${"value"}, ${"eq"}, ${"enum"}, ${"variant:open"})`

    await db`INSERT INTO condition_predicate(uuid, condition, predicate_order, subject_kind, operator, value_kind)
             VALUES (${"predicate:status:in"}, ${"condition:status"}, ${1}, ${"value"}, ${"in"}, ${"list"})`

    await db`INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
             VALUES (${"predicate:status:in"}, ${0}, ${"enum"}, ${"variant:open"})`

    await db`INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
             VALUES (${"predicate:status:in"}, ${1}, ${"enum"}, ${"variant:closed"})`

    await db`DELETE FROM field_enum_variant WHERE uuid = ${"variant:closed"}`

    const predicateAfterEnumDelete = (
      (await db`SELECT COUNT(*) as count FROM condition_predicate WHERE uuid = ${"predicate:status:in"}`) as Array<{ count: number }>
    )[0]!
    const listItemAfterEnumDelete = (
      (await db`SELECT COUNT(*) as count FROM condition_list_item WHERE predicate = ${"predicate:status:in"}`) as Array<{ count: number }>
    )[0]!

    expect(predicateAfterEnumDelete.count).toBe(1)
    expect(listItemAfterEnumDelete.count).toBe(1)

    await db`INSERT INTO process(uuid, meta, key, type)
             VALUES (${"process:finally"}, ${"alpha/meta"}, ${"cleanup"}, ${"finally"})`

    await db`INSERT INTO process_action(process, action)
             VALUES (${"process:finally"}, ${"src/action.ts"})`

    await db`INSERT INTO process_action_read(process, field, phase)
             VALUES (${"process:finally"}, ${"field:beta:title"}, ${"action"})`

    await db`INSERT INTO reaction(uuid, meta, key, label, cond_source, update_source)
             VALUES (${"reaction:alpha"}, ${"alpha/meta"}, ${"refresh"}, ${"Refresh"}, ${"() => true"}, ${"() => ({})"})`

    await db`INSERT INTO reaction_superposition(reaction, superposition)
             VALUES (${"reaction:alpha"}, ${"state:beta"})`

    await db`INSERT INTO reaction_write(reaction, field)
             VALUES (${"reaction:alpha"}, ${"field:beta:title"})`

    const transitionCount = ((await db`SELECT COUNT(*) as count FROM transition`) as Array<{ count: number }>)[0]!
    const processActionCount = ((await db`SELECT COUNT(*) as count FROM process_action`) as Array<{ count: number }>)[0]!
    const reactionWriteCount = ((await db`SELECT COUNT(*) as count FROM reaction_write`) as Array<{ count: number }>)[0]!

    expect(transitionCount.count).toBe(1)
    const conditionCount = ((await db`SELECT COUNT(*) as count FROM condition`) as Array<{ count: number }>)[0]!
    const predicateCount = ((await db`SELECT COUNT(*) as count FROM condition_predicate`) as Array<{ count: number }>)[0]!
    const listItemCount = ((await db`SELECT COUNT(*) as count FROM condition_list_item`) as Array<{ count: number }>)[0]!
    expect(processActionCount.count).toBe(1)
    expect(conditionCount.count).toBe(2)
    expect(predicateCount.count).toBe(4)
    expect(listItemCount.count).toBe(1)
    expect(reactionWriteCount.count).toBe(1)
  })

  test("хранит particle projection matter как structural rows без semantic trigger-guards", async () => {
    await db`INSERT INTO meta(src) VALUES (${"alpha/meta"}), (${"beta/meta"})`

    await db`INSERT INTO matter_binding(uuid, meta, binding_kind, literal_kind, literal_text)
             VALUES (${"binding:src"}, ${"beta/meta"}, ${"static"}, ${"text"}, ${"beta/root"})`

    await db`INSERT INTO matter_binding(uuid, meta, binding_kind)
             VALUES (${"binding:predicate"}, ${"beta/meta"}, ${"variable"})`

    await db`INSERT INTO matter_particle(uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${"particle:alpha:fuzzy"}, ${"alpha/meta"}, ${null}, ${"fuzzy"}, ${"root"}, ${0})`

    await db`INSERT INTO matter_particle(uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${"particle:beta:wimp"}, ${"beta/meta"}, ${"particle:alpha:fuzzy"}, ${"wimp"}, ${"child"}, ${0})`

    await db`INSERT INTO matter_particle_fuzzy(particle, fuzzy_kind, predicate_binding)
             VALUES (${"particle:alpha:fuzzy"}, ${"cond"}, ${"binding:predicate"})`

    await db`INSERT INTO matter_particle_wimp(particle, src, fields_binding, mass_binding)
             VALUES (${"particle:beta:wimp"}, ${"beta/root"}, ${"binding:src"}, ${null})`

    await expect(async () => {
      await db`INSERT INTO matter_particle(uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
               VALUES (${"particle:bad-check"}, ${"beta/meta"}, ${null}, ${"wimp"}, ${"child"}, ${1})`
    }).toThrow()

    await db`INSERT INTO matter_particle(uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${"particle:alpha:then"}, ${"alpha/meta"}, ${"particle:alpha:fuzzy"}, ${"wimp"}, ${"then"}, ${0})`

    await expect(async () => {
      await db`INSERT INTO matter_particle(uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
               VALUES (${"particle:alpha:then-dup"}, ${"alpha/meta"}, ${"particle:alpha:fuzzy"}, ${"wimp"}, ${"then"}, ${1})`
    }).toThrow()

    const particleCount = ((await db`SELECT COUNT(*) as count FROM matter_particle`) as Array<{ count: number }>)[0]!
    const fuzzyCount = ((await db`SELECT COUNT(*) as count FROM matter_particle_fuzzy`) as Array<{ count: number }>)[0]!
    const wimpCount = ((await db`SELECT COUNT(*) as count FROM matter_particle_wimp`) as Array<{ count: number }>)[0]!

    expect(particleCount.count).toBe(3)
    expect(fuzzyCount.count).toBe(1)
    expect(wimpCount.count).toBe(1)
  })
})
