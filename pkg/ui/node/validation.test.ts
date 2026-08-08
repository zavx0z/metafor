import {describe, expect, test} from "bun:test"
import type {NodeSystemDocument} from "./model.ts"
import {validateNodeSystemDocument} from "./validation.ts"

const valid: NodeSystemDocument = {
  revision: 4,
  nodes: [
    {id: "host", title: "Host", ports: [{id: "out", direction: "out"}]},
    {id: "window", title: "Window", ports: [{id: "in", direction: "in"}]},
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
      nodes: [{id: "host", title: "Host", ports: [{id: "p", direction: "in"}, {id: "p", direction: "out"}]}],
      edges: [],
    })).toThrow("Duplicate port id: host/p")
  })

  test("rejects dangling nodes and ports", () => {
    expect(() => validateNodeSystemDocument({
      ...valid,
      edges: [{id: "missing-node", source: {nodeId: "host"}, target: {nodeId: "other"}}],
    })).toThrow("Unknown target node")
    expect(() => validateNodeSystemDocument({
      ...valid,
      edges: [{id: "missing-port", source: {nodeId: "host", portId: "missing"}, target: {nodeId: "window"}}],
    })).toThrow("Unknown source port")
  })
})
