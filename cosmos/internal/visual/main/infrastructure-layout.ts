import {layoutFixed} from "@zavx0z/immersive/nodes/layout"
import type {GraphEditorProps} from "@zavx0z/immersive/nodes/editor"
import {nodeSocketLayoutPortId} from "@zavx0z/immersive-nodes/view/tree"

/**
Размещает реальные DOM-измерения в Frame compounds без локальных координат.
Сокеты существуют только вместе с Links; output/input определяет стороны
раскладки двунаправленного соединения, не направление transport.
*/
export function createInfrastructureLayout(width: number, height: number): NonNullable<GraphEditorProps["measureLayout"]> {
  return (snapshot, _presentation, measurements) => {
    const byId = new Map(snapshot.nodes.map(node => [node.id, node]))
    return layoutFixed({
      viewport: {width, height},
      nodes: [
        ...snapshot.frames.map(frame => ({id: frame.id, width: 280, height: 220, contentHeight: 36})),
        ...measurements.map(node => ({
          id: node.id,
          parentId: byId.get(node.id)!.frameId!,
          width: node.width,
          height: node.height,
        })),
      ],
      ports: measurements.flatMap(node => node.anchors.map(anchor => ({
        id: nodeSocketLayoutPortId(node.id, anchor.id),
        nodeId: node.id,
        y: anchor.y,
      }))),
      edges: snapshot.links.map(link => ({
        id: link.id,
        sourcePortId: nodeSocketLayoutPortId(link.from.nodeId, link.from.socketId),
        targetPortId: nodeSocketLayoutPortId(link.to.nodeId, link.to.socketId),
      })),
      layoutOptions: {spacing: 48, padding: 32},
    })
  }
}
