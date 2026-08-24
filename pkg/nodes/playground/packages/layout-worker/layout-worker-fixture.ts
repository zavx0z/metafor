import type {AdaptiveLayoutGraph} from "@nodes/layout/adaptive"
import type {FixedLayoutGraph} from "@nodes/layout/fixed"

export function fixedWorkerFixture(): FixedLayoutGraph {
  return {
    viewport: {width: 900, height: 600},
    layoutOptions: {spacing: 28, layerSpacing: 28, padding: 28, clearance: 28},
    nodes: [
      {id: "source", width: 180, height: 100},
      {id: "target", width: 180, height: 100},
    ],
    ports: [
      {id: "source/out", nodeId: "source", y: 50},
      {id: "target/in", nodeId: "target", y: 50},
    ],
    edges: [{id: "value", sourcePortId: "source/out", targetPortId: "target/in"}],
  }
}

export function adaptiveWorkerFixture(): AdaptiveLayoutGraph {
  return {
    ...fixedWorkerFixture(),
    ports: [
      {id: "source/io", nodeId: "source", y: 50, capability: "inout", allowedSides: ["WEST", "EAST"]},
      {id: "target/io", nodeId: "target", y: 50, capability: "inout", allowedSides: ["WEST", "EAST"]},
    ],
    edges: [{id: "value", sourcePortId: "source/io", targetPortId: "target/io"}],
  }
}
