import { SQL } from "bun"
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { BoundaryWimpSqlite } from "./sqlite.ts"

const metaforDslTableNames = [
  "wimp",
  "field",
  "field_default",
  "field_string_default",
  "field_number_default",
  "field_boolean_default",
  "field_array_default_item",
  "field_enum_variant",
  "field_enum_default",
  "state",
  "transition",
  "condition",
  "condition_predicate",
  "condition_list_item",
  "process",
  "process_action",
  "process_finally",
  "process_env",
  "process_action_read",
  "process_action_write",
  "process_finally_read",
  "reaction",
  "reaction_state",
  "reaction_read",
  "reaction_write",
  "matter_binding",
  "matter_binding_dep",
  "matter_particle",
  "matter_particle_wimp",
  "matter_particle_fuzzy",
  "matter_particle_axion",
  "matter_particle_macho",
] as const

const metaforDslIndexNames = [
  "field_by_wimp",
  "state_by_wimp",
  "condition_by_transition",
  "condition_predicate_by_condition",
  "condition_list_item_by_predicate",
  "process_by_wimp",
  "process_env_by_process",
  "process_action_read_by_process",
  "process_action_write_by_process",
  "process_finally_read_by_process",
  "reaction_by_wimp",
  "reaction_state_by_reaction",
  "reaction_read_by_reaction",
  "reaction_write_by_reaction",
  "matter_binding_by_wimp",
  "matter_binding_dep_by_binding",
  "matter_root_particle_order",
  "matter_particle_child_order",
  "matter_particle_branch_slot",
  "matter_particle_by_wimp",
  "matter_particle_by_parent",
] as const

describe("sqlite ddl", () => {
  let db: SQL
  let wimps: BoundaryWimpSqlite

  beforeEach(async () => {
    db = new SQL("sqlite::memory:")
    await db.unsafe("PRAGMA foreign_keys = ON;")
    wimps = await BoundaryWimpSqlite.open(db)
  })

  afterEach(async () => {
    if (db) {
      await db.close()
    }
  })

  test("wimp.create принимает опциональные параметры и сохраняет полную декларацию", async () => {
      const wimp = await wimps.create("alpha/meta", {
        name: "Alpha",
        desc: "Demo",
        bulk: {view: ".root {}"},
        fields: [
          {key: "title", type: "string", required: true, default: "draft"},
          {key: "status", type: "enum", required: true, values: ["open", "closed"], default: "open"},
        ],
        superposition: [
          {name: "idle", transitions: {done: {title: "draft"}}},
          {name: "done"},
        ],
        processes: [
          {
            key: "submit",
            declaration: {
              type: "action",
              env: ["server"],
              action: {src: "./submit.ts", read: ["title"]},
              success: {src: "() => {}", read: ["status"], write: ["title"]},
            },
          },
        ],
        reactions: [
          {
            key: "on-status",
            label: "On status",
            cond: "() => true",
            src: "() => {}",
            read: ["title"],
            write: ["status"],
            states: ["idle"],
          },
        ],
        matter: [
          {
            kind: "fuzzy",
            fuzzyKind: "dynamic-meta",
            predicateBinding: {data: "status"},
            children: [
              {
                edgeSlot: "branch",
                particle: {
                  kind: "wimp",
                  src: "alpha/child",
                  fieldsBinding: {data: "status", expr: "{ status: _[0] }"},
                  massBinding: {data: "/mass/cache", expr: "{ cache: _[0] }"},
                  energyBinding: {data: "/energy/socket", expr: "{ socket: _[0] }"},
                },
              },
            ],
          },
        ],
      })

      expect(await wimp.name.get()).toBe("Alpha")
      expect(await wimp.desc.get()).toBe("Demo")
      expect(await wimp.fields.count()).toBe(2)
      expect(await wimp.states.count()).toBe(2)
      expect(await wimp.processes.count()).toBe(1)
      expect(await wimp.reactions.count()).toBe(1)
      expect(await wimp.matter.count()).toBe(1)
      expect(await wimp.matter.all()).toEqual([
        {
          kind: "fuzzy",
          fuzzyKind: "dynamic-meta",
          predicateBinding: {data: "status"},
          children: [
            {
              edgeSlot: "branch",
              particle: {
                kind: "wimp",
                src: "alpha/child",
                fieldsBinding: {data: "status", expr: "{ status: _[0] }"},
                massBinding: {data: "/mass/cache", expr: "{ cache: _[0] }"},
                energyBinding: {data: "/energy/socket", expr: "{ socket: _[0] }"},
              },
            },
          ],
        },
      ])

  })

  test("wimp.exists проверяет декларацию без ORM get", async () => {
    expect(await wimps.exists("alpha/meta")).toBe(false)

    await wimps.create("alpha/meta")

    expect(await wimps.exists("alpha/meta")).toBe(true)
  })

  test("создаёт meta-level таблицы и индексы из sql-модулей dsl без trigger-слоя", async () => {
    const tables = (
      (await db`SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name <> 'sqlite_sequence'
                ORDER BY name`) as Array<{ name: string }>
    ).map((row) => row.name)

    const indexes = (
      (await db.unsafe(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index'
           AND name NOT LIKE '${"sqlite_auto" + "index%"}'
         ORDER BY name`,
      )) as Array<{ name: string }>
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

  test("добавляет energy_binding в существующую таблицу Matter WIMP без потери mass_binding", async () => {
    await db.unsafe(`
      DROP TABLE matter_particle_wimp;
      CREATE TABLE matter_particle_wimp (
        particle INTEGER PRIMARY KEY,
        src TEXT NOT NULL,
        fields_binding INTEGER,
        mass_binding INTEGER
      );
    `)

    wimps = await BoundaryWimpSqlite.open(db)

    expect(((await db.unsafe(`PRAGMA table_info(matter_particle_wimp)`)) as Array<{name: string}>).map((row) => row.name))
      .toEqual(["particle", "src", "fields_binding", "mass_binding", "energy_binding"])
  })

  test("держит entity-таблицы на id и child/subtype tables без parent-derived дублей", async () => {
    const wimpColumns = ((await db.unsafe(`PRAGMA table_info(wimp)`)) as Array<{ name: string }>).map((row) => row.name)
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

    const stateColumns = (
      (await db.unsafe(`PRAGMA table_info(state)`)) as Array<{ name: string }>
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
    const reactionStateColumns = (
      (await db.unsafe(`PRAGMA table_info(reaction_state)`)) as Array<{ name: string }>
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

    expect(wimpColumns).toEqual([
      "src",
      "name",
      "desc",
      "view_css",
    ])
    expect(fieldColumns).toEqual(["id", "wimp", "local_id", "key", "type", "required", "label"])
    expect(fieldDefaultColumns).toEqual(["field"])
    expect(fieldArrayItemColumns).toEqual(["id", "field", "position", "item_value"])
    expect(fieldEnumVariantColumns).toEqual(["id", "wimp", "local_id", "field", "position", "item_value"])
    expect(fieldEnumDefaultColumns).toEqual(["field", "variant"])

    expect(stateColumns).toEqual(["id", "wimp", "local_id", "name", "position"])
    expect(transitionColumns).toEqual(["id", "wimp", "local_id", "from_state", "to_state", "position"])
    expect(conditionColumns).toEqual(["id", "wimp", "local_id", "transition", "field", "position"])
    expect(conditionPredicateColumns).toEqual([
      "id",
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
    expect(reactionStateColumns).toEqual(["reaction", "state"])

    expect(matterParticleColumns).toEqual(["id", "wimp", "local_id", "parent_particle", "particle_kind", "edge_slot", "particle_order"])
    expect(matterParticleWimpColumns).toEqual(["particle", "src", "fields_binding", "mass_binding", "energy_binding"])
    expect(matterParticleFuzzyColumns).toEqual(["particle", "fuzzy_kind", "predicate_binding"])
    expect(matterParticleAxionColumns).toEqual(["particle", "predicate_binding"])
    expect(matterParticleMachoColumns).toEqual(["particle", "collection_binding"])
  })

  test("держит только structural constraints через FK UNIQUE CHECK", async () => {
    await db`INSERT INTO wimp(src) VALUES (${"alpha/meta"})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${10}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`

    await expect(async () => {
      await db`INSERT INTO field(id, wimp, key, type, required)
               VALUES (${11}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO field(id, wimp, key, type, required)
               VALUES (${12}, ${"alpha/meta"}, ${"bad"}, ${"string"}, ${2})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO field_default(field) VALUES (${999})`
    }).toThrow()

    await db`INSERT INTO field_default(field) VALUES (${10})`
    await db`INSERT INTO field_string_default(field, default_value) VALUES (${10}, ${"draft"})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${20}, ${"alpha/meta"}, ${"items"}, ${"array"}, ${1})`

    await db`INSERT INTO field_default(field) VALUES (${20})`

    await db`INSERT INTO field_array_default_item(id, field, position, item_value)
             VALUES (${30}, ${20}, ${0}, ${"10"})`

    await expect(async () => {
      await db`INSERT INTO field_array_default_item(id, field, position, item_value)
               VALUES (${31}, ${20}, ${0}, ${"20"})`
    }).toThrow()

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${40}, ${"alpha/meta"}, ${"status"}, ${"enum"}, ${1})`

    await db`INSERT INTO field_enum_variant(id, field, position, item_value)
             VALUES (${50}, ${40}, ${0}, ${"open"})`

    await expect(async () => {
      await db`INSERT INTO field_enum_variant(id, field, position, item_value)
               VALUES (${51}, ${40}, ${0}, ${"open-dup"})`
    }).toThrow()

    await expect(async () => {
      await db`INSERT INTO reaction(id, wimp, key, label, cond_source, update_source)
               VALUES (${60}, ${"missing/meta"}, ${"refresh"}, ${"Refresh"}, ${"() => true"}, ${"() => ({})"})`
    }).toThrow()
  })

  test("не дублирует semantic validation триггерами и допускает structurally-valid rows", async () => {
    await db`INSERT INTO wimp(src) VALUES (${"alpha/meta"}), (${"beta/meta"})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${1}, ${"alpha/meta"}, ${"title"}, ${"string"}, ${1})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${2}, ${"beta/meta"}, ${"title"}, ${"string"}, ${1})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${3}, ${"beta/meta"}, ${"tags"}, ${"array"}, ${1})`

    await db`INSERT INTO field(id, wimp, key, type, required)
             VALUES (${4}, ${"beta/meta"}, ${"status"}, ${"enum"}, ${1})`

    await db`INSERT INTO field_enum_variant(id, field, position, item_value)
             VALUES (${5}, ${4}, ${0}, ${"open"})`

    await db`INSERT INTO field_enum_variant(id, field, position, item_value)
             VALUES (${6}, ${4}, ${1}, ${"closed"})`

    await db`INSERT INTO state(id, wimp, name, position)
             VALUES (${7}, ${"alpha/meta"}, ${"idle"}, ${0})`

    await db`INSERT INTO state(id, wimp, name, position)
             VALUES (${8}, ${"beta/meta"}, ${"idle"}, ${0})`

    await db`INSERT INTO transition(id, from_state, to_state, position)
             VALUES (${9}, ${7}, ${8}, ${0})`

    await db`INSERT INTO condition(id, transition, field, position)
             VALUES (${10}, ${9}, ${3}, ${0})`

    await db`INSERT INTO condition_predicate(id, condition, predicate_order, subject_kind, operator, value_kind, value_number)
             VALUES (${12}, ${10}, ${0}, ${"length"}, ${"gte"}, ${"number"}, ${2})`

    await expect(async () => {
      await db`INSERT INTO condition_predicate(id, condition, predicate_order, subject_kind, operator, value_kind, value_number)
               VALUES (${13}, ${10}, ${2}, ${"length"}, ${"length"}, ${"number"}, ${2})`
    }).toThrow()

    await db`INSERT INTO condition_predicate(id, condition, predicate_order, subject_kind, operator, value_kind, value_text)
             VALUES (${14}, ${10}, ${1}, ${"value"}, ${"include"}, ${"string"}, ${"urgent"})`

    await db`INSERT INTO condition(id, transition, field, position)
             VALUES (${11}, ${9}, ${4}, ${1})`

    await db`INSERT INTO condition_predicate(id, condition, predicate_order, subject_kind, operator, value_kind, value_variant)
             VALUES (${15}, ${11}, ${0}, ${"value"}, ${"eq"}, ${"enum"}, ${5})`

    await db`INSERT INTO condition_predicate(id, condition, predicate_order, subject_kind, operator, value_kind)
             VALUES (${16}, ${11}, ${1}, ${"value"}, ${"in"}, ${"list"})`

    await db`INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
             VALUES (${16}, ${0}, ${"enum"}, ${5})`

    await db`INSERT INTO condition_list_item(predicate, item_order, value_kind, value_variant)
             VALUES (${16}, ${1}, ${"enum"}, ${6})`

    await db`DELETE FROM field_enum_variant WHERE id = ${6}`

    const predicateAfterEnumDelete = (
      (await db`SELECT COUNT(*) as count FROM condition_predicate WHERE id = ${16}`) as Array<{ count: number }>
    )[0]!
    const listItemAfterEnumDelete = (
      (await db`SELECT COUNT(*) as count FROM condition_list_item WHERE predicate = ${16}`) as Array<{ count: number }>
    )[0]!

    expect(predicateAfterEnumDelete.count).toBe(1)
    expect(listItemAfterEnumDelete.count).toBe(1)

    await db`INSERT INTO process(id, wimp, key, type)
             VALUES (${17}, ${"alpha/meta"}, ${"cleanup"}, ${"finally"})`

    await db`INSERT INTO process_action(process, action)
             VALUES (${17}, ${"src/action.ts"})`

    await db`INSERT INTO process_action_read(process, field, phase)
             VALUES (${17}, ${2}, ${"action"})`

    await db`INSERT INTO reaction(id, wimp, key, label, cond_source, update_source)
             VALUES (${18}, ${"alpha/meta"}, ${"refresh"}, ${"Refresh"}, ${"() => true"}, ${"() => ({})"})`

    await db`INSERT INTO reaction_state(reaction, state)
             VALUES (${18}, ${8})`

    await db`INSERT INTO reaction_write(reaction, field)
             VALUES (${18}, ${2})`

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
    await db`INSERT INTO wimp(src) VALUES (${"alpha/meta"}), (${"beta/meta"})`

    await db`INSERT INTO matter_binding(id, wimp, binding_kind, literal_kind, literal_text)
             VALUES (${1}, ${"beta/meta"}, ${"static"}, ${"text"}, ${"beta/root"})`

    await db`INSERT INTO matter_binding(id, wimp, binding_kind)
             VALUES (${2}, ${"beta/meta"}, ${"variable"})`

    await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${1}, ${"alpha/meta"}, ${null}, ${"axion"}, ${"root"}, ${0})`

    await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${2}, ${"beta/meta"}, ${1}, ${"wimp"}, ${"child"}, ${0})`

    await db`INSERT INTO matter_particle_axion(particle, predicate_binding)
             VALUES (${1}, ${2})`

    await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${3}, ${"alpha/meta"}, ${null}, ${"fuzzy"}, ${"root"}, ${1})`

    await db`INSERT INTO matter_particle_fuzzy(particle, fuzzy_kind, predicate_binding)
             VALUES (${3}, ${"dynamic-meta"}, ${2})`

    await db`INSERT INTO matter_particle_wimp(particle, src, fields_binding, mass_binding, energy_binding)
             VALUES (${2}, ${"beta/root"}, ${1}, ${null}, ${2})`

    await expect(async () => {
      await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
               VALUES (${4}, ${"beta/meta"}, ${null}, ${"wimp"}, ${"child"}, ${1})`
    }).toThrow()

    await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
             VALUES (${5}, ${"alpha/meta"}, ${1}, ${"wimp"}, ${"then"}, ${0})`

    await expect(async () => {
      await db`INSERT INTO matter_particle(id, wimp, parent_particle, particle_kind, edge_slot, particle_order)
               VALUES (${6}, ${"alpha/meta"}, ${1}, ${"wimp"}, ${"then"}, ${1})`
    }).toThrow()

    const particleCount = ((await db`SELECT COUNT(*) as count FROM matter_particle`) as Array<{ count: number }>)[0]!
    const fuzzyCount = ((await db`SELECT COUNT(*) as count FROM matter_particle_fuzzy`) as Array<{ count: number }>)[0]!
    const axionCount = ((await db`SELECT COUNT(*) as count FROM matter_particle_axion`) as Array<{ count: number }>)[0]!
    const wimpCount = ((await db`SELECT COUNT(*) as count FROM matter_particle_wimp`) as Array<{ count: number }>)[0]!

    expect(particleCount.count).toBe(4)
    expect(fuzzyCount.count).toBe(1)
    expect(axionCount.count).toBe(1)
    expect(wimpCount.count).toBe(1)
  })
})
