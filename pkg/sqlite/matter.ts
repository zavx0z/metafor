import type { Database } from "bun:sqlite"
import type { MetaDSL, MatterSchema, NodeType } from "../.."

type BindingValue =
  | string
  | boolean
  | {
      data?: string | string[]
      expr?: string
    }

const toBindingPaths = (value: BindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const insertBinding = (db: Database, src: string, value: BindingValue | undefined): string | undefined => {
  if (value === undefined) return

  const uuid = crypto.randomUUID()

  if (typeof value === "string") {
    db.query(
      "INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text) VALUES (?, ?, ?, ?, ?)",
    ).run(uuid, src, "static", "text", value)
    return uuid
  }

  if (typeof value === "boolean") {
    db.query(
      "INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_boolean) VALUES (?, ?, ?, ?, ?)",
    ).run(uuid, src, "static", "boolean", value ? 1 : 0)
    return uuid
  }

  const paths = toBindingPaths(value)
  if (value.expr !== undefined) {
    db.query("INSERT INTO matter_binding (uuid, meta, binding_kind, expr) VALUES (?, ?, ?, ?)")
      .run(uuid, src, "dynamic", value.expr)
  } else {
    db.query("INSERT INTO matter_binding (uuid, meta, binding_kind) VALUES (?, ?, ?)")
      .run(uuid, src, "variable")
  }

  paths.forEach((path, index) => {
    db.query("INSERT INTO matter_binding_dep (binding, dep_order, path) VALUES (?, ?, ?)")
      .run(uuid, index, path)
  })

  return uuid
}

const insertEventUpdates = (
  db: Database,
  attrUuid: string,
  updates: string | string[] | undefined,
  fieldUuids: Map<string, string>,
): void => {
  const keys = updates === undefined ? [] : Array.isArray(updates) ? updates : [updates]

  keys.forEach((fieldKey, index) => {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) return

    db.query("INSERT INTO matter_event_update (attr, update_order, field) VALUES (?, ?, ?)")
      .run(attrUuid, index, fieldUuid)
  })
}

const insertNodeAttributes = (
  db: Database,
  src: string,
  nodeUuid: string,
  node: Record<string, unknown>,
  fieldUuids: Map<string, string>,
): void => {
  const stringAttrs = node.string as Record<string, BindingValue> | undefined
  for (const [attrName, value] of Object.entries(stringAttrs ?? {})) {
    const attrUuid = crypto.randomUUID()
    const bindingUuid = insertBinding(db, src, value)
    if (!bindingUuid) continue

    db.query("INSERT INTO matter_attr (uuid, owner_node, attr_family, attr_name) VALUES (?, ?, ?, ?)")
      .run(attrUuid, nodeUuid, "string", attrName)
    db.query("INSERT INTO matter_attr_binding (attr, binding) VALUES (?, ?)").run(attrUuid, bindingUuid)
  }

  const booleanAttrs = node.boolean as Record<string, BindingValue> | undefined
  for (const [attrName, value] of Object.entries(booleanAttrs ?? {})) {
    const attrUuid = crypto.randomUUID()
    const bindingUuid = insertBinding(db, src, value)
    if (!bindingUuid) continue

    db.query("INSERT INTO matter_attr (uuid, owner_node, attr_family, attr_name) VALUES (?, ?, ?, ?)")
      .run(attrUuid, nodeUuid, "boolean", attrName)
    db.query("INSERT INTO matter_attr_binding (attr, binding) VALUES (?, ?)").run(attrUuid, bindingUuid)
  }

  const arrayAttrs = node.array as Record<string, BindingValue[]> | undefined
  for (const [attrName, value] of Object.entries(arrayAttrs ?? {})) {
    const attrUuid = crypto.randomUUID()
    db.query("INSERT INTO matter_attr (uuid, owner_node, attr_family, attr_name) VALUES (?, ?, ?, ?)")
      .run(attrUuid, nodeUuid, "array", attrName)

    value.forEach((part, index) => {
      const bindingUuid = insertBinding(db, src, part)
      if (!bindingUuid) return

      db.query("INSERT INTO matter_attr_part (attr, part_order, binding) VALUES (?, ?, ?)")
        .run(attrUuid, index, bindingUuid)
    })
  }

  const styleAttrs = node.style as Record<string, BindingValue> | undefined
  if (styleAttrs && Object.keys(styleAttrs).length > 0) {
    const attrUuid = crypto.randomUUID()
    db.query("INSERT INTO matter_attr (uuid, owner_node, attr_family, attr_name) VALUES (?, ?, ?, ?)")
      .run(attrUuid, nodeUuid, "style", "style")

    for (const [propName, value] of Object.entries(styleAttrs)) {
      const bindingUuid = insertBinding(db, src, value)
      if (!bindingUuid) continue

      db.query("INSERT INTO matter_style_prop (attr, prop_name, binding) VALUES (?, ?, ?)")
        .run(attrUuid, propName, bindingUuid)
    }
  }

  const eventAttrs = node.event as Record<string, { upd?: string | string[]; data?: string | string[]; expr?: string }> | undefined
  for (const [attrName, value] of Object.entries(eventAttrs ?? {})) {
    const attrUuid = crypto.randomUUID()
    const bindingUuid = insertBinding(
      db,
      src,
      value.expr !== undefined ? { ...(value.data !== undefined ? { data: value.data } : {}), expr: value.expr } : { data: value.data },
    )
    if (!bindingUuid) continue

    db.query("INSERT INTO matter_attr (uuid, owner_node, attr_family, attr_name) VALUES (?, ?, ?, ?)")
      .run(attrUuid, nodeUuid, "event", attrName)
    db.query("INSERT INTO matter_attr_binding (attr, binding) VALUES (?, ?)").run(attrUuid, bindingUuid)
    insertEventUpdates(db, attrUuid, value.upd, fieldUuids)
  }
}

export function relationMatter(
  db: Database,
  meta: MetaDSL,
  src: string,
  fieldUuids: Map<string, string>,
): void {
  if (!meta.matter) return

  const ms = meta.matter as MatterSchema

  const processNode = (node: NodeType, parentNodeUuid: string | null, slot: string, order: number) => {
    if (!["meta", "cond", "log", "map"].includes(node.type)) {
      throw new Error(`Unsupported matter node type "${node.type}" for canonical SQLite relation`)
    }

    const nodeUuid = crypto.randomUUID()
    db.query("INSERT INTO matter_node (uuid, meta, node_kind, tag) VALUES (?, ?, ?, ?)")
      .run(nodeUuid, src, node.type, (node as any).tag || null)

    const edgeUuid = crypto.randomUUID()
    db.query(
      "INSERT INTO matter_edge (uuid, root_meta, parent_node, child_node, edge_slot, edge_order) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(edgeUuid, parentNodeUuid ? null : src, parentNodeUuid, nodeUuid, slot, order)

    if (node.type === "meta") {
      const n = node as any
      const srcBindingUuid = insertBinding(db, src, n.src)
      const fieldsBindingUuid = insertBinding(db, src, n.fields)
      const massBindingUuid = insertBinding(db, src, n.mass)
      db.query("INSERT INTO matter_meta (node, src_binding, fields_binding, mass_binding) VALUES (?, ?, ?, ?)")
        .run(nodeUuid, srcBindingUuid, fieldsBindingUuid || null, massBindingUuid || null)
      insertNodeAttributes(db, src, nodeUuid, n, fieldUuids)
    }

    if (node.type === "cond") {
      const n = node as any
      const predicateBindingUuid = insertBinding(
        db,
        src,
        n.expr !== undefined ? { data: n.data, expr: n.expr } : { data: n.data },
      )
      db.query("INSERT INTO matter_condition (node, predicate_binding) VALUES (?, ?)")
        .run(nodeUuid, predicateBindingUuid)

      if (Array.isArray(n.child)) {
        if (n.child[0]) processNode(n.child[0], nodeUuid, "then", 0)
        if (n.child[1]) processNode(n.child[1], nodeUuid, "else", 1)
      }
      return
    }

    if (node.type === "log") {
      const n = node as any
      const predicateBindingUuid = insertBinding(
        db,
        src,
        n.expr !== undefined ? { data: n.data, expr: n.expr } : { data: n.data },
      )
      db.query("INSERT INTO matter_logical (node, predicate_binding) VALUES (?, ?)")
        .run(nodeUuid, predicateBindingUuid)
    }

    if (node.type === "map") {
      const n = node as any
      const collectionBindingUuid = insertBinding(db, src, { data: n.data })
      db.query("INSERT INTO matter_map (node, collection_binding) VALUES (?, ?)")
        .run(nodeUuid, collectionBindingUuid)
    }

    if ("child" in node && Array.isArray(node.child) && node.child.length > 0) {
      node.child.forEach((child, i) => {
        processNode(child, nodeUuid, "child", i)
      })
    }
  }

  ms.forEach((node, i) => processNode(node, null, "root", i))
}
