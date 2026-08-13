import {describe, expect, test} from "bun:test"
import type {NodeSystemNode, NodeSystemRect} from "nodes/types"
import {
  NODE_SYSTEM_CARD_METRICS,
  NODE_SYSTEM_PORT_PITCH,
  measureNodeSystemCard,
  measureNodeSystemCardContentHeight,
  nodeSystemGeometryKey,
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
    {id: "input", parameterId: "state", direction: "in"},
    {id: "events", parameterId: "revision", direction: "out"},
    {id: "control", parameterId: "placement", direction: "inout"},
  ],
}

describe("Flex node-card metric plan", () => {
  test("reports occupied content without decorative trailing body padding", () => {
    const headerOnly: NodeSystemNode = {id: "header", title: "Header"}
    const oneFact: NodeSystemNode = {
      id: "fact",
      title: "Fact",
      facts: [{id: "state", label: "State", value: "ready"}],
    }

    expect(measureNodeSystemCardContentHeight(headerOnly)).toBe(NODE_SYSTEM_CARD_METRICS.headerHeight)
    expect(measureNodeSystemCard(oneFact).height - measureNodeSystemCardContentHeight(oneFact))
      .toBe(NODE_SYSTEM_CARD_METRICS.bodyPaddingY)
  })

  test("derives one routing rhythm from the actual adjacent port centers", () => {
    const size = measureNodeSystemCard(denseNode)
    const plan = planNodeSystemCard(denseNode, {x: 0, y: 0, w: size.width, h: size.height})
    const centers = plan.ports.map(({marker}) => marker.y + marker.h / 2).sort((left, right) => left - right)

    expect(NODE_SYSTEM_PORT_PITCH)
      .toBe(NODE_SYSTEM_CARD_METRICS.factRowHeight + NODE_SYSTEM_CARD_METRICS.rowGap)
    for (let index = 1; index < centers.length; index += 1) {
      expect(centers[index]! - centers[index - 1]!).toBe(NODE_SYSTEM_PORT_PITCH)
    }
  })

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
    ]
    expect(textSlots.every((rect) => contained(rect, plan.frame))).toBe(true)

    const rows = plan.facts.map(({row}) => row)
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
    expect(nodeSystemGeometryKey({nodes: [{...short, layoutId: "slot-a"}]}, exact))
      .not.toBe(nodeSystemGeometryKey({nodes: [{...short, layoutId: "slot-b"}]}, exact))

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
        {id: "supervision", label: "Supervision", value: "input"},
      ],
      ports: [
        {id: "supervision", parameterId: "supervision", direction: "inout"},
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
    expect(plan.facts[0]!.value.w).toBeGreaterThanOrEqual(NODE_SYSTEM_CARD_METRICS.fieldControlMinWidth)
    expect(plan.ports[0]!.row).toEqual(plan.facts[1]!.row)
  })

  test("keeps data direction independent from the requested visual side", () => {
    const node: NodeSystemNode = {
      id: "sides",
      title: "Sides",
      facts: [
        {id: "left", label: "Left", value: "out"},
        {id: "right", label: "Right", value: "in"},
      ],
      ports: [
        {id: "out-left", parameterId: "left", direction: "out", side: "left"},
        {id: "in-right", parameterId: "right", direction: "in", side: "right"},
      ],
    }
    const size = measureNodeSystemCard(node)
    const plan = planNodeSystemCard(node, {x: 10, y: 20, w: size.width, h: size.height})
    expect(plan.ports.find(({port}) => port.id === "out-left")!.marker.x).toBeLessThan(10)
    const rightMarker = plan.ports.find(({port}) => port.id === "in-right")!.marker
    expect(rightMarker.x + rightMarker.w / 2).toBe(10 + size.width)
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
