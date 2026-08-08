import {describe, expect, test} from "bun:test"
import type {NodeSystemNode, NodeSystemRect} from "./model.ts"
import {
  NODE_SYSTEM_CARD_METRICS,
  measureNodeSystemCard,
  nodeSystemGeometryKey,
  nodeSystemPortDirectionLabel,
  planNodeSystemCard,
  type NodeSystemTextMeasurer,
} from "./card-layout.ts"

const denseNode: NodeSystemNode = {
  id: "dense",
  title: "Dense node with a title that must remain inside its slot",
  kind: "runtime",
  summary: "A summary is constrained by the same metric plan as the card.",
  width: 80,
  height: 40,
  facts: [
    {id: "state", label: "State", value: "ready"},
    {id: "revision", label: "Revision", value: "42"},
    {id: "placement", label: "Placement", value: "local"},
  ],
  ports: [
    {id: "input", label: "Input", direction: "in"},
    {id: "events", label: "Events", direction: "out"},
    {id: "control", label: "Control", direction: "inout"},
  ],
}

describe("Flex node-card metric plan", () => {
  test("expands undersized producer dimensions and keeps content rows inside the card", () => {
    const size = measureNodeSystemCard(denseNode)
    expect(size.width).toBeGreaterThan(denseNode.width!)
    expect(size.height).toBeGreaterThan(denseNode.height!)

    const plan = planNodeSystemCard(denseNode, {x: 0, y: 0, w: size.width, h: size.height})
    const textSlots = [
      plan.title,
      plan.kind!,
      plan.summary!,
      ...plan.facts.flatMap(({label, value}) => [label, value]),
      ...plan.ports.flatMap(({label, direction}) => [label, direction]),
    ]
    expect(textSlots.every((rect) => contained(rect, plan.frame))).toBe(true)

    const rows = [...plan.facts.map(({row}) => row), ...plan.ports.map(({row}) => row)]
      .sort((left, right) => left.y - right.y)
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1]!.y + rows[index - 1]!.h).toBeLessThanOrEqual(rows[index]!.y)
    }
    expect(rows.at(-1)!.y + rows.at(-1)!.h).toBeLessThanOrEqual(plan.frame.y + plan.frame.h)
  })

  test("scales every internal slot proportionally with the externally positioned frame", () => {
    const size = measureNodeSystemCard(denseNode)
    const logical = planNodeSystemCard(denseNode, {x: 0, y: 0, w: size.width, h: size.height})
    const scale = 0.25
    const origin = {x: 17, y: 29}
    const scaled = planNodeSystemCard(denseNode, {
      x: origin.x,
      y: origin.y,
      w: size.width * scale,
      h: size.height * scale,
    }, scale)

    expectRectScaled(logical.header, scaled.header, origin, scale)
    expectRectScaled(logical.title, scaled.title, origin, scale)
    expectRectScaled(logical.summary!, scaled.summary!, origin, scale)
    for (let index = 0; index < logical.facts.length; index += 1) {
      expectRectScaled(logical.facts[index]!.label, scaled.facts[index]!.label, origin, scale)
      expectRectScaled(logical.facts[index]!.value, scaled.facts[index]!.value, origin, scale)
    }
    for (let index = 0; index < logical.ports.length; index += 1) {
      expectRectScaled(logical.ports[index]!.marker, scaled.ports[index]!.marker, origin, scale)
      expectRectScaled(logical.ports[index]!.label, scaled.ports[index]!.label, origin, scale)
    }
  })

  test("uses exact text metrics for intrinsic width and a relayout geometry key", () => {
    const exact: NodeSystemTextMeasurer = (value, fontPx) => value.length * fontPx * 0.61
    const short = {...denseNode, summary: "short"}
    const long = {...denseNode, summary: "x".repeat(500)}
    const shortSize = measureNodeSystemCard(short, exact)
    const longSize = measureNodeSystemCard(long, exact)

    expect(longSize.width).toBeGreaterThan(shortSize.width)
    expect(longSize.width).toBe(NODE_SYSTEM_CARD_METRICS.maximumWidth)
    expect(nodeSystemGeometryKey({nodes: [short]}, exact))
      .not.toBe(nodeSystemGeometryKey({nodes: [long]}, exact))

    const explicit = measureNodeSystemCard({...long, width: 700}, exact)
    expect(explicit.width).toBe(700)
  })

  test("does not truncate measured text while the card has enough room", () => {
    const exact: NodeSystemTextMeasurer = (value, fontPx) => value.length * fontPx
    const node: NodeSystemNode = {
      id: "intrinsic-slots",
      title: "Hamiltonian",
      kind: "distributed coordinator",
      facts: [
        {id: "placement", label: "Placement on a remote host", value: "local"},
      ],
      ports: [
        {id: "supervision", label: "Supervision", direction: "inout"},
      ],
    }
    const size = measureNodeSystemCard(node, exact)
    const plan = planNodeSystemCard(node, {x: 0, y: 0, w: size.width, h: size.height}, 1, exact)

    expect(plan.title.w).toBeGreaterThanOrEqual(exact(node.title, NODE_SYSTEM_CARD_METRICS.titleFontPx))
    expect(plan.kind!.w).toBeGreaterThanOrEqual(exact(node.kind!, NODE_SYSTEM_CARD_METRICS.metaFontPx))
    expect(plan.facts[0]!.label.w)
      .toBeGreaterThanOrEqual(exact(node.facts![0]!.label, NODE_SYSTEM_CARD_METRICS.bodyFontPx))
    expect(plan.facts[0]!.value.w)
      .toBeGreaterThanOrEqual(exact(node.facts![0]!.value, NODE_SYSTEM_CARD_METRICS.bodyFontPx))
    expect(plan.ports[0]!.direction.w)
      .toBeGreaterThanOrEqual(exact(nodeSystemPortDirectionLabel(node.ports![0]!.direction), NODE_SYSTEM_CARD_METRICS.metaFontPx))
  })
})

function contained(inner: NodeSystemRect, outer: NodeSystemRect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h
}

function expectRectScaled(
  logical: NodeSystemRect,
  scaled: NodeSystemRect,
  origin: Readonly<{x: number; y: number}>,
  scale: number,
): void {
  expect(scaled.x).toBeCloseTo(origin.x + logical.x * scale, 10)
  expect(scaled.y).toBeCloseTo(origin.y + logical.y * scale, 10)
  expect(scaled.w).toBeCloseTo(logical.w * scale, 10)
  expect(scaled.h).toBeCloseTo(logical.h * scale, 10)
}
