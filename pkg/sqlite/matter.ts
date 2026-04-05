import type { Database } from "bun:sqlite"
import type { MetaDSL, MatterSchema, NodeType } from "../.."

export function relationMatter(db: Database, meta: MetaDSL, src: string): void {
  if (!meta.matter) return

  const ms = meta.matter as MatterSchema
  let nodeCounter = 0
  let edgeCounter = 0
  let bindingCounter = 0

  const processNode = (node: NodeType, parentNodeUuid: string | null, slot: string, order: number) => {
    const nodeUuid = `node:${src}:${nodeCounter++}`
    db.query("INSERT INTO matter_node (uuid, meta, node_kind, tag) VALUES (?, ?, ?, ?)")
      .run(nodeUuid, src, node.type, (node as any).tag || null)

    const edgeUuid = `edge:${src}:${edgeCounter++}`
    db.query(
      "INSERT INTO matter_edge (uuid, root_meta, parent_node, child_node, edge_slot, edge_order) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(edgeUuid, parentNodeUuid ? null : src, parentNodeUuid, nodeUuid, slot, order)

    if (node.type === "meta") {
      const n = node as any
      const srcBindingUuid = `binding:${src}:${bindingCounter++}`
      db.query("INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text) VALUES (?, ?, ?, ?, ?)")
        .run(srcBindingUuid, src, "static", "text", typeof n.src === "string" ? n.src : n.src.data)

      db.query("INSERT INTO matter_meta (node, src_binding) VALUES (?, ?)")
        .run(nodeUuid, srcBindingUuid)
    }

    if ("child" in node && node.child.length) {
      node.child.forEach((child, i) => {
        processNode(child, nodeUuid, node.type === "map" ? "child" : "child", i)
      })
    }
  }

  ms.forEach((node, i) => processNode(node, null, "root", i))
}
