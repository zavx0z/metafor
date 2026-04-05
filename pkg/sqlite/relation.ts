import type {Database} from "bun:sqlite"
import type {MetaDSL, NodeType, ParsedProcess, ReactionsSchema} from "../.."
import type {MatterSchema} from "../../matter.t.ts"

export function relation(db: Database, meta: MetaDSL, src: string): void {
  db.transaction(() => {
    // 1. Meta
    db.query("INSERT INTO meta (src, name, desc, view_css) VALUES (?, ?, ?, ?)")

      .run(src, meta.name, meta.desc || null, meta.bulk?.view || null)

    // 2. Fields
    const fieldUuids = new Map<string, string>()
    for (const [key, def] of Object.entries(meta.fields)) {
      const uuid = `field:${src}:${key}`
      fieldUuids.set(key, uuid)
      db.query("INSERT INTO field (uuid, meta, key, type, required, label) VALUES (?, ?, ?, ?, ?, ?)").run(
        uuid,
        src,
        key,
        def.type,
        def.required ? 1 : 0,
        def.label || null,
      )

      if ("default" in def && def.default !== undefined) {
        db.query("INSERT INTO field_default (field) VALUES (?)").run(uuid)
        if (def.type === "string") {
          db.query("INSERT INTO field_string_default (field, default_value) VALUES (?, ?)").run(
            uuid,
            def.default as string,
          )
        } else if (def.type === "number") {
          db.query("INSERT INTO field_number_default (field, default_value) VALUES (?, ?)").run(
            uuid,
            def.default as number,
          )
        } else if (def.type === "boolean") {
          db.query("INSERT INTO field_boolean_default (field, default_value) VALUES (?, ?)").run(
            uuid,
            def.default ? 1 : 0,
          )
        } else if (def.type === "array") {
          db.query("INSERT INTO field_array_default (field) VALUES (?)").run(uuid)
          ;(def.default as number[]).forEach((val, i) => {
            const itemUuid = `item:${uuid}:${i}`
            db.query("INSERT INTO field_array_default_item (uuid, field, position) VALUES (?, ?, ?)").run(
              itemUuid,
              uuid,
              i,
            )
            db.query("INSERT INTO field_array_number_default_item (item, item_value) VALUES (?, ?)").run(itemUuid, val)
          })
        }
      }

      if (def.type === "enum" && "values" in def && Array.isArray(def.values)) {
        const variantUuids = new Map<string | number, string>()
        def.values.forEach((val: string | number, i: number) => {
          const variantUuid = `variant:${uuid}:${val}`
          variantUuids.set(val, variantUuid)
          db.query("INSERT INTO field_enum_variant (uuid, field, position) VALUES (?, ?, ?)").run(variantUuid, uuid, i)
          if (typeof val === "string") {
            db.query("INSERT INTO field_enum_string_variant (variant, item_value) VALUES (?, ?)").run(variantUuid, val)
          }
        })

        if ("default" in def && def.default !== undefined) {
          const variantUuid = variantUuids.get(def.default as string | number)
          if (variantUuid) {
            db.query("INSERT INTO field_enum_default (field, variant) VALUES (?, ?)").run(uuid, variantUuid)
          }
        }
      }
    }

    // 3. Superposition
    const stateUuids = new Map<string, string>()
    const states = Object.keys(meta.superposition)
    states.forEach((name, i) => {
      const uuid = `state:${src}:${name}`
      stateUuids.set(name, uuid)
      db.query("INSERT INTO superposition (uuid, meta, name, position) VALUES (?, ?, ?, ?)").run(uuid, src, name, i)
    })

    // 4. Transitions & Conditions
    let transitionCounter = 0
    for (const [fromName, transitions] of Object.entries(meta.superposition)) {
      if (!transitions) continue
      const fromUuid = stateUuids.get(fromName)!

      let transitionPos = 0
      for (const [toName, cond] of Object.entries(transitions as Record<string, any>)) {
        const toUuid = stateUuids.get(toName)!
        const transitionUuid = `transition:${src}:${transitionCounter++}`

        db.query(
          "INSERT INTO transition (uuid, from_superposition, to_superposition, position) VALUES (?, ?, ?, ?)",
        ).run(transitionUuid, fromUuid, toUuid, transitionPos++)

        if (cond && typeof cond === "object") {
          let condPos = 0
          for (const [fieldKey, predicate] of Object.entries(cond)) {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (!fieldUuid) continue

            const condUuid = `condition:${transitionUuid}:${fieldKey}`
            db.query("INSERT INTO condition (uuid, transition, field, position) VALUES (?, ?, ?, ?)").run(
              condUuid,
              transitionUuid,
              fieldUuid,
              condPos++,
            )

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

                db.query(
                  `INSERT INTO condition_predicate (uuid, condition, predicate_order, subject_kind, operator,
                                                    value_kind, value_boolean, value_number, value_text,
                                                    value_variant)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ).run(
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
        const uuid = `process:${src}:${state}`
        const pp = p as ParsedProcess
        db.query("INSERT INTO process (uuid, meta, key, type, label, desc) VALUES (?, ?, ?, ?, ?, ?)").run(
          uuid,
          src,
          state,
          pp.type || "action",
          pp.label || null,
          pp.desc || null,
        )

        if (pp.env) {
          pp.env.forEach((env) => {
            db.query("INSERT INTO process_env (process, env) VALUES (?, ?)").run(uuid, env)
          })
        }
      })
    }

    // 6. Reactions
    if (meta.reactions) {
      const rs = meta.reactions as ReactionsSchema
      for (const [id, r] of Object.entries(rs.reactions)) {
        const uuid = `reaction:${src}:${id}`
        db.query(
          "INSERT INTO reaction (uuid, meta, key, label, desc, cond_source, update_source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(uuid, src, id, r.label, r.desc || null, r.cond, r.src)

        if (r.read) {
          r.read.forEach((fieldKey) => {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (fieldUuid) {
              db.query("INSERT INTO reaction_read (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
            }
          })
        }
        if (r.write) {
          r.write.forEach((fieldKey) => {
            const fieldUuid = fieldUuids.get(fieldKey)
            if (fieldUuid) {
              db.query("INSERT INTO reaction_write (reaction, field) VALUES (?, ?)").run(uuid, fieldUuid)
            }
          })
        }
      }

      for (const [state, reactionIds] of Object.entries(rs.superposition)) {
        const stateUuid = stateUuids.get(state)
        if (stateUuid) {
          reactionIds.forEach((id) => {
            const reactionUuid = `reaction:${src}:${id}`
            db.query("INSERT INTO reaction_superposition (reaction, superposition) VALUES (?, ?)").run(
              reactionUuid,
              stateUuid,
            )
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

      const processNode = (node: NodeType, parentNodeUuid: string | null, slot: string, order: number) => {
        const nodeUuid = `node:${src}:${nodeCounter++}`
        db.query("INSERT INTO matter_node (uuid, meta, node_kind, tag) VALUES (?, ?, ?, ?)").run(
          nodeUuid,
          src,
          node.type,
          (node as any).tag || null,
        )

        const edgeUuid = `edge:${src}:${edgeCounter++}`
        db.query(
          "INSERT INTO matter_edge (uuid, root_meta, parent_node, child_node, edge_slot, edge_order) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(edgeUuid, parentNodeUuid ? null : src, parentNodeUuid, nodeUuid, slot, order)

        if (node.type === "meta") {
          const n = node as any
          const srcBindingUuid = `binding:${src}:${bindingCounter++}`
          db.query(
            "INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text) VALUES (?, ?, ?, ?, ?)",
          ).run(srcBindingUuid, src, "static", "text", typeof n.src === "string" ? n.src : n.src.data)

          db.query("INSERT INTO matter_meta (node, src_binding) VALUES (?, ?)").run(nodeUuid, srcBindingUuid)
        }

        if ("child" in node && node.child.length) {
          node.child.forEach((child, i) => {
            processNode(child, nodeUuid, node.type === "map" ? "child" : "child", i)
          })
        }
      }

      ms.forEach((node, i) => processNode(node, null, "root", i))
    }
  })()
}
