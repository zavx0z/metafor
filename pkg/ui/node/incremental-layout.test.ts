import {describe, expect, test} from "bun:test"
import type {
  NodeSystemDocument,
  PositionedNodeSystem,
  PositionedNodeSystemNode,
} from "./model.ts"
import {
  applyNodeSystemAnchors,
  isNodeSystemRectVacant,
  moveNodeSystemNode,
  moveNodeSystemNodes,
  resizeNodeSystemNode,
  stabilizeNodeSystemLayout,
} from "./incremental-layout.ts"

function node(id: string, x: number, y: number, order: number): PositionedNodeSystemNode {
  const model = {
    id,
    title: id,
    order,
    ports: [{id: "in", direction: "in" as const}, {id: "out", direction: "out" as const}],
  }
  return {
    node: model,
    rect: {x, y, w: 100, h: 60},
    ports: [
      {port: model.ports[0]!, center: {x, y: y + 30}},
      {port: model.ports[1]!, center: {x: x + 100, y: y + 30}},
    ],
  }
}

function layout(nodes: readonly PositionedNodeSystemNode[], revision: number): PositionedNodeSystem {
  const document: NodeSystemDocument = {
    revision,
    nodes: nodes.map((entry) => entry.node),
    edges: nodes.length < 2 ? [] : [{
      id: "edge",
      source: {nodeId: nodes[0]!.node.id, portId: "out"},
      target: {nodeId: nodes.at(-1)!.node.id, portId: "in"},
    }],
  }
  return {
    revision,
    geometryKey: `geometry:${revision}`,
    bounds: {x: 0, y: 0, w: 800, h: 600},
    nodes,
    edges: document.edges.map((edge) => ({edge, points: [{x: 0, y: 0}, {x: 1, y: 1}]})),
  }
}

describe("stable structural node-system updates", () => {
  test("anchors every survivor and moves only an overlapping inserted node", () => {
    const previous = layout([node("a", 40, 40, 0), node("b", 300, 40, 1)], 1)
    const proposed = layout([
      node("a", 80, 100, 0),
      node("new", 170, 100, 1),
      node("b", 520, 100, 2),
    ], 2)
    const stable = stabilizeNodeSystemLayout(previous, proposed, {spacing: 24})

    expect(stable.nodes.find(({node}) => node.id === "a")?.rect).toEqual(previous.nodes[0]!.rect)
    expect(stable.nodes.find(({node}) => node.id === "b")?.rect).toEqual(previous.nodes[1]!.rect)
    const inserted = stable.nodes.find(({node}) => node.id === "new")!
    expect(inserted.rect.x).toBe(40)
    expect(inserted.rect.y).toBeGreaterThanOrEqual(124)
    expect(overlap(inserted.rect, previous.nodes[0]!.rect)).toBe(false)
    expect(stable.geometryKey).toBe("geometry:2")
    expect(stable.revision).toBe(2)
  })

  test("removal never repositions surviving nodes", () => {
    const previous = layout([node("a", 40, 40, 0), node("middle", 180, 40, 1), node("b", 320, 40, 2)], 1)
    const proposed = layout([node("a", 100, 100, 0), node("b", 260, 100, 1)], 2)
    const stable = stabilizeNodeSystemLayout(previous, proposed)

    expect(stable.nodes.map(({node}) => node.id)).toEqual(["a", "b"])
    expect(stable.nodes.map(({rect}) => rect)).toEqual([previous.nodes[0]!.rect, previous.nodes[2]!.rect])
    expect(stable.edges[0]?.points).toEqual([{x: 140, y: 70}, {x: 320, y: 70}])
  })

  test("aligns an inserted node to the current position of its connected survivor", () => {
    const previous = layout([node("a", 1_000, 700, 0)], 1)
    const proposed = layout([node("a", 40, 40, 0), node("new", 180, 40, 1)], 2)
    const stable = stabilizeNodeSystemLayout(previous, proposed)

    expect(stable.nodes.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 1_000, y: 700},
      {x: 1_140, y: 700},
    ])
  })

  test("returns a reinserted node to its vacated relative slot", () => {
    const initial = layout([node("a", 1_000, 700, 0), node("temporary", 1_140, 700, 1)], 1)
    const removedProposal = layout([node("a", 40, 40, 0)], 2)
    const removed = stabilizeNodeSystemLayout(initial, removedProposal)
    const reinsertedProposal = layout([node("a", 40, 40, 0), node("temporary", 180, 40, 1)], 3)
    const reinserted = stabilizeNodeSystemLayout(removed, reinsertedProposal)

    expect(reinserted.nodes.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 1_000, y: 700},
      {x: 1_140, y: 700},
    ])
  })

  test("rejects a historical frame that would overlap the current scene", () => {
    const current = layout([node("a", 40, 40, 0), node("returning", 300, 40, 1)], 1)

    expect(isNodeSystemRectVacant(current, "returning", {x: 40, y: 40, w: 100, h: 60})).toBe(false)
    expect(isNodeSystemRectVacant(current, "returning", {x: 180, y: 40, w: 100, h: 60}, {spacing: 24})).toBe(true)
  })

  test("moves exactly one card, its ports and connected edge endpoint", () => {
    const base = layout([node("a", 40, 40, 0), node("b", 300, 40, 1)], 1)
    const original: PositionedNodeSystem = {
      ...base,
      edges: [{...base.edges[0]!, points: [{x: 140, y: 70}, {x: 220, y: 180}, {x: 300, y: 70}]}],
    }
    const moved = moveNodeSystemNode(original, "a", {x: -60, y: 120})

    expect(moved.nodes[0]?.rect).toEqual({x: -60, y: 120, w: 100, h: 60})
    expect(moved.nodes[0]?.ports.map(({center}) => center)).toEqual([
      {x: -60, y: 150},
      {x: 40, y: 150},
    ])
    expect(moved.nodes[1]).toEqual(original.nodes[1])
    expect(moved.edges[0]?.points).toEqual([{x: 40, y: 150}, {x: 220, y: 180}, {x: 300, y: 70}])
    expect(moved.bounds.x).toBeLessThanOrEqual(-100)
  })

  test("applies known persisted anchors and ignores disappeared node IDs", () => {
    const original = layout([node("a", 40, 40, 0), node("b", 300, 40, 1)], 1)
    const anchored = applyNodeSystemAnchors(original, new Map([
      ["a", {x: 17, y: 23}],
      ["gone", {x: 999, y: 999}],
    ]))
    expect(anchored.nodes.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 17, y: 23},
      {x: 300, y: 40},
    ])
  })

  test("resizes one card from either edge and keeps sockets and links attached", () => {
    const base = layout([node("a", 40, 40, 0), node("b", 300, 40, 1)], 1)
    const original: PositionedNodeSystem = {
      ...base,
      edges: [{...base.edges[0]!, points: [{x: 140, y: 70}, {x: 220, y: 180}, {x: 300, y: 70}]}],
    }

    const right = resizeNodeSystemNode(original, "a", {x: 40, w: 180})
    expect(right.nodes[0]?.rect).toEqual({x: 40, y: 40, w: 180, h: 60})
    expect(right.nodes[0]?.ports.map(({center}) => center)).toEqual([
      {x: 40, y: 70},
      {x: 220, y: 70},
    ])
    expect(right.edges[0]?.points).toEqual([{x: 220, y: 70}, {x: 220, y: 180}, {x: 300, y: 70}])

    const left = resizeNodeSystemNode(original, "a", {x: -40, w: 180})
    expect(left.nodes[0]?.rect).toEqual({x: -40, y: 40, w: 180, h: 60})
    expect(left.nodes[0]?.ports.map(({center}) => center)).toEqual([
      {x: -40, y: 70},
      {x: 140, y: 70},
    ])
    expect(left.edges[0]?.points).toEqual([{x: 140, y: 70}, {x: 220, y: 180}, {x: 300, y: 70}])
    expect(left.nodes[1]).toEqual(original.nodes[1])
  })

  test("moves a selected group atomically", () => {
    const base = layout([node("a", 40, 40, 0), node("middle", 180, 40, 1), node("b", 320, 40, 2)], 1)
    const original: PositionedNodeSystem = {
      ...base,
      edges: [{...base.edges[0]!, points: [{x: 140, y: 70}, {x: 220, y: 180}, {x: 320, y: 70}]}],
    }
    const moved = moveNodeSystemNodes(original, new Map([
      ["a", {x: 70, y: 90}],
      ["middle", {x: 210, y: 90}],
    ]))
    expect(moved.nodes.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 70, y: 90},
      {x: 210, y: 90},
      {x: 320, y: 40},
    ])
    expect(moved.edges[0]?.points[0]).toEqual({x: 170, y: 120})
    expect(moved.edges[0]?.points.at(-1)).toEqual({x: 320, y: 70})
  })
})

function overlap(
  left: Readonly<{x: number; y: number; w: number; h: number}>,
  right: Readonly<{x: number; y: number; w: number; h: number}>,
): boolean {
  return left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y
}
