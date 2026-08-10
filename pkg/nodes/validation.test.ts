import {describe, expect, test} from "bun:test"
import type {NodeSystemDocument} from "./types/model.ts"
import {validateNodeSystemDocument} from "./validation.ts"

const valid: NodeSystemDocument = {
  revision: 4,
  nodes: [
    {id: "host", title: "Host", facts: [{id: "channel", label: "Channel", value: "out"}], ports: [{id: "out", parameterId: "channel", direction: "out"}]},
    {id: "window", title: "Window", facts: [{id: "channel", label: "Channel", value: "in"}], ports: [{id: "in", parameterId: "channel", direction: "in"}]},
  ],
  edges: [{id: "host-window", source: {nodeId: "host", portId: "out"}, target: {nodeId: "window", portId: "in"}}],
}

describe("node-system validation", () => {
  test("indexes an unambiguous structured-clone-safe document", () => {
    const index = validateNodeSystemDocument(valid)
    expect(index.nodes.size).toBe(2)
    expect(index.ports.get("host")?.get("out")?.direction).toBe("out")
  })

  test("rejects duplicate identities", () => {
    expect(() => validateNodeSystemDocument({...valid, nodes: [...valid.nodes, valid.nodes[0]!]}))
      .toThrow("Duplicate node id: host")
    expect(() => validateNodeSystemDocument({
      nodes: [{id: "host", title: "Host", facts: [{id: "p", label: "P", value: ""}], ports: [{id: "p", parameterId: "p", direction: "in"}, {id: "p", parameterId: "p", direction: "out"}]}],
      edges: [],
    })).toThrow("Duplicate port id: host/p")
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
      nodes: [{
        id: "host",
        title: "Host",
        facts: [{id: "known", label: "Known", value: ""}],
        ports: [{id: "socket", parameterId: "missing", direction: "out"}],
      }],
      edges: [],
    })).toThrow("Unknown port parameter")
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
      nodes: [{id: "owner", title: "Owner"}, {id: "child", parentId: "owner", title: "Child"}],
      edges: [],
    })).not.toThrow()
    expect(() => validateNodeSystemDocument({
      nodes: [{id: "child", parentId: "missing", title: "Child"}],
      edges: [],
    })).toThrow("Unknown parent node")
    expect(() => validateNodeSystemDocument({
      nodes: [
        {id: "root", title: "Root"},
        {id: "middle", parentId: "root", title: "Middle"},
        {id: "leaf", parentId: "middle", title: "Leaf"},
      ],
      edges: [],
    })).not.toThrow()
    expect(() => validateNodeSystemDocument({
      nodes: [
        {id: "left", parentId: "right", title: "Left"},
        {id: "right", parentId: "left", title: "Right"},
      ],
      edges: [],
    })).toThrow("Containment cycle")
  })
})
