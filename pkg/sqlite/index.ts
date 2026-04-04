import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../metafor.t.ts"
import type { ParsedProcess } from "../../process.t.ts"
import type { ReactionsSchema } from "../../reactions.t.ts"
import type { MatterSchema, NodeType } from "../../matter.t.ts"
import metaforSchemaSql from "../../metafor.sql" with { type: "text" }
import fieldsSchemaSql from "../../fields.sql" with { type: "text" }
import superpositionSchemaSql from "../../superposition.sql" with { type: "text" }
import processSchemaSql from "../../process.sql" with { type: "text" }
import actionSchemaSql from "../../action.sql" with { type: "text" }
import finallySchemaSql from "../../finally.sql" with { type: "text" }
import reactionsSchemaSql from "../../reactions.sql" with { type: "text" }
import matterSchemaSql from "../../matter.sql" with { type: "text" }

export const metaforDslTableNames = [
  "meta",
  "field",
  "field_default",
  "field_string_default",
  "field_number_default",
  "field_boolean_default",
  "field_array_default",
  "field_array_default_item",
  "field_array_string_default_item",
  "field_array_number_default_item",
  "field_enum_variant",
  "field_enum_string_variant",
  "field_enum_number_variant",
  "field_enum_default",
  "superposition",
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
  "reaction_superposition",
  "reaction_read",
  "reaction_write",
  "matter_node",
  "matter_edge",
  "matter_binding",
  "matter_binding_dep",
  "matter_meta",
  "matter_condition",
  "matter_logical",
  "matter_map",
  "matter_attr",
  "matter_attr_binding",
  "matter_attr_part",
  "matter_style_prop",
  "matter_event_update",
] as const

export const metaforDslIndexNames = [
  "field_by_meta",
  "superposition_by_meta",
  "condition_by_transition",
  "condition_predicate_by_condition",
  "condition_list_item_by_predicate",
  "process_by_meta",
  "process_env_by_process",
  "process_action_read_by_process",
  "process_action_write_by_process",
  "process_finally_read_by_process",
  "reaction_by_meta",
  "reaction_superposition_by_reaction",
  "reaction_read_by_reaction",
  "reaction_write_by_reaction",
  "matter_root_order",
  "matter_child_order",
  "matter_cond_branch_slot",
  "matter_node_by_meta",
  "matter_edge_by_parent_node",
  "matter_binding_by_meta",
  "matter_binding_dep_by_binding",
  "matter_attr_by_owner_node",
  "matter_event_update_by_attr",
] as const

export type MetaforDslDatabase = Pick<Database, "run">

const metaforDslSchemaSqlModules = [
  metaforSchemaSql,
  fieldsSchemaSql,
  superpositionSchemaSql,
  processSchemaSql,
  actionSchemaSql,
  finallySchemaSql,
  reactionsSchemaSql,
  matterSchemaSql,
] as const

export const metaforDslSchemaSql = metaforDslSchemaSqlModules
  .map((sql) => sql.trim())
  .filter(Boolean)
  .join("\n\n")
  .trim()

export const initializeMetaforDslSqliteSchema = (database: MetaforDslDatabase): void => {
  database.run("PRAGMA foreign_keys = ON;")
  database.run("PRAGMA journal_mode = WAL;")
  database.run(metaforDslSchemaSql)
}

export function exportMetaToSqlite(database: Database, meta: MetaDSL): void {
  database.transaction(() => {
    // 1. Meta
    database
      .query("INSERT INTO meta (src, name, desc, view_css) VALUES (?, ?, ?, ?)")
      .run(meta.name, meta.name, meta.desc || null, meta.bulk?.view || null)

    // 2. Fields
    const fieldUuids = new Map<string, string>()
    for (const [key, def] of Object.entries(meta.fields)) {
      const uuid = `field:${meta.name}:${key}`
      fieldUuids.set(key, uuid)
      database
        .query("INSERT INTO field (uuid, meta, key, type, required, label) VALUES (?, ?, ?, ?, ?, ?)")
        .run(uuid, meta.name, key, def.type, def.required ? 1 : 0, def.label || null)

      if ("default" in def && def.default !== undefined) {
        database.query("INSERT INTO field_default (field) VALUES (?)").run(uuid)
        if (def.type === "string") {
          database
            .query("INSERT INTO field_string_default (field, default_value) VALUES (?, ?)")
            .run(uuid, def.default as string)
        } else if (def.type === "number") {
          database
            .query("INSERT INTO field_number_default (field, default_value) VALUES (?, ?)")
            .run(uuid, def.default as number)
        } else if (def.type === "boolean") {
          database
            .query("INSERT INTO field_boolean_default (field, default_value) VALUES (?, ?)")
            .run(uuid, def.default ? 1 : 0)
        } else if (def.type === "array") {
          database.query("INSERT INTO field_array_default (field) VALUES (?)").run(uuid)
          ;(def.default as number[]).forEach((val, i) => {
            const itemUuid = `item:${uuid}:${i}`
            database
              .query("INSERT INTO field_array_default_item (uuid, field, position) VALUES (?, ?, ?)")
              .run(itemUuid, uuid, i)
            database
              .query("INSERT INTO field_array_number_default_item (item, item_value) VALUES (?, ?)")
              .run(itemUuid, val)
          })
        }
      }

      if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
        const variantUuids = new Map<string | number, string>()
        def.values.forEach((val: string | number, i: number) => {
          const variantUuid = `variant:${uuid}:${val}`
          variantUuids.set(val, variantUuid)
          database
            .query("INSERT INTO field_enum_variant (uuid, field, position) VALUES (?, ?, ?)")
            .run(variantUuid, uuid, i)
          if (typeof val === "string") {
            database
              .query("INSERT INTO field_enum_string_variant (variant, item_value) VALUES (?, ?)")
              .run(variantUuid, val)
          }
        })

        if ("default" in def && def.default !== undefined) {
          const variantUuid = variantUuids.get(def.default as string | number)
          if (variantUuid) {
            database.query("INSERT INTO field_enum_default (field, variant) VALUES (?, ?)").run(uuid, variantUuid)
          }
        }
      }
    }

    // 3. Superposition
    const stateUuids = new Map<string, string>()
    const states = Object.keys(meta.superposition)
    states.forEach((name, i) => {
      const uuid = `state:${meta.name}:${name}`
      stateUuids.set(name, uuid)
      database
        .query("INSERT INTO superposition (uuid, meta, name, position) VALUES (?, ?, ?, ?)")
        .run(uuid, meta.name, name, i)
    })

    // 4. Transitions & Conditions
    let transitionCounter = 0
    for (const [fromName, transitions] of Object.entries(meta.superposition)) {
      if (!transitions) continue
      const fromUuid = stateUuids.get(fromName)!

      let transitionPos = 0
      for (const [toName, cond] of Object.entries(transitions as Record<string, any>)) {
        const toUuid = stateUuids.get(toName)!
        const transitionUuid = `transition:${meta.name}:${transitionCounter++}`

        database
          .query("INSERT INTO transition (uuid, from_superposition, to_superposition, position) VALUES (?, ?, ?, ?)")
          .run(transitionUuid, fromUuid, toUuid, transitionPos++)

        if (cond && typeof cond === "object") {
          let condPos = 0
          for (const [fieldKey, predicate] of Object.entries(cond)) {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (!fieldUuid) continue

            const condUuid = `condition:${transitionUuid}:${fieldKey}`
            database
              .query("INSERT INTO condition (uuid, transition, field, position) VALUES (?, ?, ?, ?)")
              .run(condUuid, transitionUuid, fieldUuid, condPos++)

            if (predicate && typeof predicate === "object") {
              let predOrder = 0
              for (const [op, val] of Object.entries(predicate)) {
                const predUuid = `predicate:${condUuid}:${predOrder}`
                let operator = op
                let valueKind = "null"
                let valueBoolean: number | null = null
                let valueNumber: number | null = null
                let valueText: string | null = null
                let valueVariant: string | null = null

                if (op === "null") {
                  operator = val === false ? "neq" : "eq"
                  valueKind = "null"
                } else if (typeof val === "boolean") {
                  valueKind = "boolean"
                  valueBoolean = val ? 1 : 0
                } else if (typeof val === "number") {
                  valueKind = "number"
                  valueNumber = val
                } else if (typeof val === "string") {
                  valueKind = "string"
                  valueText = val
                }

                database
                  .query(
                    `INSERT INTO condition_predicate (uuid, condition, predicate_order, subject_kind, operator, value_kind, value_boolean, value_number, value_text, value_variant)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  )
                  .run(
                    predUuid,
                    condUuid,
                    predOrder++,
                    "value",
                    operator,
                    valueKind,
                    valueBoolean,
                    valueNumber,
                    valueText,
                    valueVariant,
                  )
              }
            }
          }
        }
      }
    }

    // 5. Processes
    if (meta.processes) {
      Object.entries(meta.processes).forEach(([state, p]) => {
        const uuid = `process:${meta.name}:${state}`
        const pp = p as ParsedProcess
        database
          .query("INSERT INTO process (uuid, meta, key, type, label, desc) VALUES (?, ?, ?, ?, ?, ?)")
          .run(uuid, meta.name, state, pp.type || "action", pp.label || null, pp.desc || null)

        if (pp.env) {
          pp.env.forEach((env) => {
            database.query("INSERT INTO process_env (process, env) VALUES (?, ?)").run(uuid, env)
          })
        }
      })
    }

    // 6. Reactions
    if (meta.reactions) {
      const rs = meta.reactions as ReactionsSchema
      for (const [id, r] of Object.entries(rs.reactions)) {
        const uuid = `reaction:${meta.name}:${id}`
        database
          .query("INSERT INTO reaction (uuid, meta, key, label, desc, cond_source, update_source) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(uuid, meta.name, id, r.label, r.desc || null, r.cond, r.src)

        if (r.read) {
          r.read.forEach((fieldKey) => {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (fieldUuid) {
              database.query("INSERT INTO reaction_read (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
            }
          })
        }
        if (r.write) {
          r.write.forEach((fieldKey) => {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (fieldUuid) {
              database.query("INSERT INTO reaction_write (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
            }
          })
        }
      }

      for (const [state, reactionIds] of Object.entries(rs.superposition)) {
        const stateUuid = stateUuids.get(state)
        if (stateUuid) {
          reactionIds.forEach((id) => {
            const reactionUuid = `reaction:${meta.name}:${id}`
            database
              .query("INSERT INTO reaction_superposition (reaction, superposition) VALUES (?, ?)")
              .run(reactionUuid, stateUuid)
          })
        }
      }
    }

    // 7. Matter
    if (meta.matter) {
      const ms = meta.matter as MatterSchema
      let nodeCounter = 0
      let edgeCounter = 0
      let bindingCounter = 0
      let attrCounter = 0

      const processNode = (node: NodeType, parentNodeUuid: string | null, slot: string, order: number) => {
        const nodeUuid = `node:${meta.name}:${nodeCounter++}`
        database
          .query("INSERT INTO matter_node (uuid, meta, node_kind, tag) VALUES (?, ?, ?, ?)")
          .run(nodeUuid, meta.name, node.type, (node as any).tag || null)

        const edgeUuid = `edge:${meta.name}:${edgeCounter++}`
        database
          .query(
            "INSERT INTO matter_edge (uuid, root_meta, parent_node, child_node, edge_slot, edge_order) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(edgeUuid, parentNodeUuid ? null : meta.name, parentNodeUuid, nodeUuid, slot, order)

        if (node.type === "meta") {
          const n = node as any
          const srcBindingUuid = `binding:${meta.name}:${bindingCounter++}`
          database
            .query("INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text) VALUES (?, ?, ?, ?, ?)")
            .run(srcBindingUuid, meta.name, "static", "text", typeof n.src === "string" ? n.src : n.src.data)

          database
            .query("INSERT INTO matter_meta (node, src_binding) VALUES (?, ?)")
            .run(nodeUuid, srcBindingUuid)
        }

        if (node.child) {
          node.child.forEach((child, i) => {
            processNode(child, nodeUuid, node.type === "map" ? "child" : "child", i)
          })
        }
      }

      ms.forEach((node, i) => processNode(node, null, "root", i))
    }
  })()
}
