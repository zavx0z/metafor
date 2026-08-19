import {describe, expect, test} from "bun:test"
import type {NodeSystemDocument} from "./types/model.ts"
import {validateNodeSystemDocument} from "./validation.ts"

const valid: NodeSystemDocument = {
  revision: 4,
  nodes: [
    {id: "host", ports: [{id: "out", direction: "out"}]},
    {id: "window", ports: [{id: "in", direction: "in"}]},
  ],
  edges: [{id: "host-window", source: {nodeId: "host", portId: "out"}, target: {nodeId: "window", portId: "in"}}],
}

describe("node-system validation", () => {
  test("indexes an unambiguous structured-clone-safe document", () => {
    const index = validateNodeSystemDocument(valid)
    expect(index.nodes.size).toBe(2)
    expect(index.ports.get("host")?.get("out")?.direction).toBe("out")
  })

  test("keeps connection semantics identical across an edge and both sockets", () => {
    const typed: NodeSystemDocument = {
      nodes: [
        {id: "host", ports: [{id: "out", direction: "out", connectionType: "ipc"}]},
        {id: "window", ports: [{id: "in", direction: "in", connectionType: "ipc"}]},
      ],
      edges: [{id: "host-window", source: {nodeId: "host", portId: "out"}, target: {nodeId: "window", portId: "in"}, connectionType: "ipc"}],
    }
    expect(() => validateNodeSystemDocument(typed)).not.toThrow()
    expect(() => validateNodeSystemDocument({
      ...typed,
      edges: [{...typed.edges[0]!, connectionType: "websocket"}],
    })).toThrow("Mismatched edge connection type: host-window")
    expect(() => validateNodeSystemDocument({
      ...typed,
      edges: [{id: "host-window", source: {nodeId: "host", portId: "out"}, target: {nodeId: "window", portId: "in"}}],
    })).toThrow("Incomplete edge connection type: host-window")
  })

  test("rejects duplicate identities", () => {
    expect(() => validateNodeSystemDocument({...valid, nodes: [...valid.nodes, valid.nodes[0]!]}))
      .toThrow("Duplicate node id: host")
    expect(() => validateNodeSystemDocument({
      nodes: [{id: "host", ports: [{id: "p", direction: "in"}, {id: "p", direction: "out"}]}],
      edges: [],
    })).toThrow("Duplicate port id: host/p")
    expect(() => validateNodeSystemDocument({
      nodes: [
        {id: "old-incarnation", layoutId: "stable-slot"},
        {id: "new-incarnation", layoutId: "stable-slot"},
      ],
      edges: [],
    })).toThrow("Duplicate node layoutId: stable-slot")
  })

  test("rejects dangling nodes and ports", () => {
    expect(() => validateNodeSystemDocument({
      ...valid,
      edges: [{id: "missing-node", source: {nodeId: "host", portId: "out"}, target: {nodeId: "other", portId: "in"}}],
    })).toThrow("Unknown target node")
    expect(() => validateNodeSystemDocument({
      ...valid,
      edges: [{id: "missing-port", source: {nodeId: "host", portId: "missing"}, target: {nodeId: "window", portId: "in"}}],
    })).toThrow("Unknown source port")
    expect(() => validateNodeSystemDocument({
      ...valid,
      edges: [{
        id: "node-level",
        source: {nodeId: "host"} as unknown as {nodeId: string; portId: string},
        target: {nodeId: "window", portId: "in"},
      }],
    })).toThrow("Unknown source port")
  })

  test("accepts nested containment and rejects invented or cyclic parents", () => {
    expect(() => validateNodeSystemDocument({
      nodes: [{id: "owner"}, {id: "child", parentId: "owner"}],
      edges: [],
    })).not.toThrow()
    expect(() => validateNodeSystemDocument({
      nodes: [{id: "child", parentId: "missing"}],
      edges: [],
    })).toThrow("Unknown parent node")
    expect(() => validateNodeSystemDocument({
      nodes: [
        {id: "root"},
        {id: "middle", parentId: "root"},
        {id: "leaf", parentId: "middle"},
      ],
      edges: [],
    })).not.toThrow()
    expect(() => validateNodeSystemDocument({
      nodes: [
        {id: "left", parentId: "right"},
        {id: "right", parentId: "left"},
      ],
      edges: [],
    })).toThrow("Containment cycle")
  })
})
