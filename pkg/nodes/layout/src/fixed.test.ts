import {describe, expect, test} from "bun:test"
import {layout as compatibilityLayout} from "@nodes/layout"
import {layoutFixed, resolveFixedLayoutGraph, type FixedLayoutGraph} from "@nodes/layout/fixed"
import {layoutResolved} from "./layout.ts"

const graph = (): FixedLayoutGraph => ({
  viewport: {width: 900, height: 600},
  nodes: [
    {id: "source", width: 180, height: 100},
    {id: "target", width: 180, height: 100},
  ],
  ports: [
    {id: "source/socket", nodeId: "source", y: 72},
    {id: "target/socket", nodeId: "target", y: 72},
  ],
  edges: [{id: "edge", sourcePortId: "source/socket", targetPortId: "target/socket"}],
})

describe("fixed layout policy", () => {
  test("resolves source EAST and target WEST before entering the common core", () => {
    const input = graph()
    const resolved = resolveFixedLayoutGraph(input)

    expect(resolved.ports).toEqual([
      {...input.ports[0]!, side: "EAST"},
      {...input.ports[1]!, side: "WEST"},
    ])
    expect(layoutFixed(input)).toEqual(layoutResolved(resolved))
    expect(layoutFixed(input).ports).toEqual([
      {id: "source/socket", x: 236, y: 128, side: "EAST"},
      {id: "target/socket", x: 264, y: 128, side: "WEST"},
    ])
  })

  test("keeps root layout as the fixed compatibility alias", () => {
    expect(compatibilityLayout(graph())).toEqual(layoutFixed(graph()))
  })

  test("rejects a port used in both fixed endpoint roles", () => {
    expect(() => layoutFixed({
      ...graph(),
      edges: [
        {id: "forward", sourcePortId: "source/socket", targetPortId: "target/socket"},
        {id: "reverse", sourcePortId: "target/socket", targetPortId: "source/socket"},
      ],
    })).toThrow("Port has conflicting edge roles: reverse/target/socket")
  })
})
