import type {LayoutGraph} from "@nodes/layout"
import type {PlaygroundFixture} from "./types.ts"

const fixedTopology = {
  nodes: [
    {id: "source-zone", width: 176, height: 58, contentHeight: 38},
    {id: "producer", parentId: "source-zone", width: 188, height: 118, contentHeight: 108},
    {id: "observer", parentId: "source-zone", width: 164, height: 94, contentHeight: 84},
    {id: "target-zone", width: 176, height: 58, contentHeight: 38},
    {id: "consumer-a", parentId: "target-zone", width: 184, height: 108, contentHeight: 98},
    {id: "consumer-b", parentId: "target-zone", width: 172, height: 98, contentHeight: 88},
  ],
  ports: [
    {id: "producer/out-primary", nodeId: "producer", y: 46},
    {id: "producer/out-secondary", nodeId: "producer", y: 82},
    {id: "consumer-a/in-primary", nodeId: "consumer-a", y: 44},
    {id: "consumer-a/out-reply", nodeId: "consumer-a", y: 76},
    {id: "consumer-b/in-secondary", nodeId: "consumer-b", y: 62},
    {id: "observer/in-reply", nodeId: "observer", y: 56},
  ],
  edges: [
    {id: "primary", sourcePortId: "producer/out-primary", targetPortId: "consumer-a/in-primary"},
    {id: "secondary", sourcePortId: "producer/out-secondary", targetPortId: "consumer-b/in-secondary"},
    {id: "reply", sourcePortId: "consumer-a/out-reply", targetPortId: "observer/in-reply"},
  ],
  layoutOptions: {spacing: 28, layerSpacing: 36, padding: 28, clearance: 28},
} as const satisfies Omit<LayoutGraph, "viewport">

function fixedFixture(
  id: string,
  label: string,
  expectedDirection: PlaygroundFixture["expectedDirection"],
  viewport: LayoutGraph["viewport"],
): PlaygroundFixture {
  return {
    id,
    family: "fixed-baseline",
    label,
    description: "The same compound topology and numeric port anchors under a different viewport shape.",
    expectedDirection,
    graph: {...fixedTopology, viewport},
  }
}

export const PLAYGROUND_FIXTURES: readonly PlaygroundFixture[] = [
  fixedFixture("fixed-baseline-right", "Fixed baseline · landscape", "RIGHT", {width: 1180, height: 680}),
  fixedFixture("fixed-baseline-down", "Fixed baseline · portrait", "DOWN", {width: 520, height: 920}),
]

export function getPlaygroundFixture(id: string): PlaygroundFixture {
  const fixture = PLAYGROUND_FIXTURES.find((candidate) => candidate.id === id)
  if (fixture === undefined) throw new Error(`Unknown playground fixture: ${id}`)
  return fixture
}

export function getFixtureFamily(family: string): readonly PlaygroundFixture[] {
  return PLAYGROUND_FIXTURES.filter((fixture) => fixture.family === family)
}
