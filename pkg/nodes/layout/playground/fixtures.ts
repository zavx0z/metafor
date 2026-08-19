import type {AdaptiveLayoutGraph} from "@nodes/layout/adaptive"
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
    {id: "producer/out-primary", nodeId: "producer", y: 46, capability: "out", allowedSides: ["EAST"]},
    {id: "producer/out-secondary", nodeId: "producer", y: 82, capability: "out", allowedSides: ["EAST"]},
    {id: "consumer-a/in-primary", nodeId: "consumer-a", y: 44, capability: "in", allowedSides: ["WEST"]},
    {id: "consumer-a/out-reply", nodeId: "consumer-a", y: 76, capability: "out", allowedSides: ["EAST"]},
    {id: "consumer-b/in-secondary", nodeId: "consumer-b", y: 62, capability: "in", allowedSides: ["WEST"]},
    {id: "observer/in-reply", nodeId: "observer", y: 56, capability: "in", allowedSides: ["WEST"]},
  ],
  edges: [
    {id: "primary", sourcePortId: "producer/out-primary", targetPortId: "consumer-a/in-primary"},
    {id: "secondary", sourcePortId: "producer/out-secondary", targetPortId: "consumer-b/in-secondary"},
    {id: "reply", sourcePortId: "consumer-a/out-reply", targetPortId: "observer/in-reply"},
  ],
  layoutOptions: {spacing: 28, layerSpacing: 36, padding: 28, clearance: 28},
} as const satisfies Omit<AdaptiveLayoutGraph, "viewport">

const adaptiveTopology = {
  nodes: [
    {id: "source", width: 168, height: 104, contentHeight: 92},
    {id: "target-a", width: 176, height: 96, contentHeight: 84},
    {id: "target-b", width: 160, height: 88, contentHeight: 76},
  ],
  ports: [
    {id: "source/shared", nodeId: "source", y: 54, capability: "inout", allowedSides: ["WEST", "EAST"]},
    {id: "target-a/in", nodeId: "target-a", y: 48, capability: "in", allowedSides: ["WEST"]},
    {id: "target-b/in", nodeId: "target-b", y: 44, capability: "in", allowedSides: ["WEST"]},
  ],
  edges: [
    {id: "to-a", sourcePortId: "source/shared", targetPortId: "target-a/in"},
    {id: "to-b", sourcePortId: "source/shared", targetPortId: "target-b/in"},
  ],
  layoutOptions: {spacing: 28, layerSpacing: 36, padding: 28, clearance: 28},
} as const satisfies Omit<AdaptiveLayoutGraph, "viewport">

const adaptiveCompoundTopology = {
  ...adaptiveTopology,
  nodes: [
    {id: "source-zone", width: 176, height: 58, contentHeight: 38},
    {id: "target-zone", width: 176, height: 58, contentHeight: 38},
    ...adaptiveTopology.nodes.map((node) => ({
      ...node,
      parentId: node.id === "source" ? "source-zone" : "target-zone",
    })),
  ],
} as const satisfies Omit<AdaptiveLayoutGraph, "viewport">

function fixedFixture(
  id: string,
  label: string,
  expectedDirection: PlaygroundFixture["expectedDirection"],
  viewport: AdaptiveLayoutGraph["viewport"],
): PlaygroundFixture {
  return {
    id,
    family: "fixed-baseline",
    label,
    description: "Одна и та же составная топология и числовые привязки портов при разной форме области просмотра.",
    expectedDirection,
    graph: {...fixedTopology, viewport},
  }
}

function adaptiveFixture(
  id: string,
  label: string,
  expectedDirection: PlaygroundFixture["expectedDirection"],
  viewport: AdaptiveLayoutGraph["viewport"],
): PlaygroundFixture {
  return {
    id,
    family: "adaptive-side-selection",
    label,
    description: "Один общий двунаправленный сокет (inout) получает одну сторону сразу для обеих связей через публичную адаптивную политику.",
    expectedDirection,
    graph: {...adaptiveTopology, viewport},
  }
}

function adaptiveCompoundFixture(
  id: string,
  label: string,
  expectedDirection: PlaygroundFixture["expectedDirection"],
  viewport: AdaptiveLayoutGraph["viewport"],
): PlaygroundFixture {
  return {
    id,
    family: "adaptive-compound-side-selection",
    label,
    description: "Один общий двунаправленный сокет (inout) связывает дочерние ноды двух контейнеров, а публичная адаптивная политика выбирает ему одну сторону.",
    expectedDirection,
    graph: {...adaptiveCompoundTopology, viewport},
  }
}

export const PLAYGROUND_FIXTURES: readonly PlaygroundFixture[] = [
  fixedFixture("fixed-baseline-right", "Фиксированная основа · альбомная", "RIGHT", {width: 1180, height: 680}),
  fixedFixture("fixed-baseline-down", "Фиксированная основа · портретная", "DOWN", {width: 520, height: 920}),
  adaptiveFixture("adaptive-shared-right", "Общий адаптивный порт · альбомная", "RIGHT", {width: 960, height: 560}),
  adaptiveFixture("adaptive-shared-down", "Общий адаптивный порт · портретная", "DOWN", {width: 480, height: 820}),
  adaptiveCompoundFixture("adaptive-compound-right", "Вложенная адаптивная раскладка · альбомная", "RIGHT", {width: 960, height: 560}),
  adaptiveCompoundFixture("adaptive-compound-down", "Вложенная адаптивная раскладка · портретная", "DOWN", {width: 480, height: 820}),
]

export function getPlaygroundFixture(id: string): PlaygroundFixture {
  const fixture = PLAYGROUND_FIXTURES.find((candidate) => candidate.id === id)
  if (fixture === undefined) throw new Error(`Неизвестный сценарий стенда: ${id}`)
  return fixture
}

export function getFixtureFamily(family: string): readonly PlaygroundFixture[] {
  return PLAYGROUND_FIXTURES.filter((fixture) => fixture.family === family)
}
