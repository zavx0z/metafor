import {flexColumn, flexRow} from "@ui/elements"
import type {
  NodeSystemFact,
  NodeSystemDocument,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemRect,
} from "./model.ts"

export const NODE_SYSTEM_CARD_METRICS = Object.freeze({
  defaultWidth: 260,
  minimumWidth: 180,
  maximumWidth: 520,
  minimumBodyHeight: 32,
  headerHeight: 34,
  bodyPaddingY: 10,
  rowGap: 4,
  summaryRowHeight: 22,
  factRowHeight: 20,
  portRowHeight: 20,
  titleFontPx: 12,
  metaFontPx: 9,
  bodyFontPx: 9,
  kindWidth: 78,
  contentPaddingX: 12,
  markerSize: 8,
})

export type NodeSystemCardSize = Readonly<{width: number; height: number}>
export type NodeSystemTextMeasurer = (value: string, fontPx: number) => number

type NodeSystemCardMeasurement = Readonly<{
  size: NodeSystemCardSize
  exact: boolean
  kindWidth: number
  factLabelWidths: ReadonlyMap<string, number>
  portDirectionWidths: ReadonlyMap<string, number>
}>

export type NodeSystemCardFactSlot = Readonly<{
  fact: NodeSystemFact
  row: NodeSystemRect
  label: NodeSystemRect
  value: NodeSystemRect
}>

export type NodeSystemCardPortSlot = Readonly<{
  port: NodeSystemPort
  row: NodeSystemRect
  marker: NodeSystemRect
  label: NodeSystemRect
  direction: NodeSystemRect
}>

export type NodeSystemCardPlan = Readonly<{
  frame: NodeSystemRect
  header: NodeSystemRect
  body: NodeSystemRect
  title: NodeSystemRect
  kind?: NodeSystemRect
  summary?: NodeSystemRect
  facts: readonly NodeSystemCardFactSlot[]
  ports: readonly NodeSystemCardPortSlot[]
}>

/**
 * One intrinsic metric model shared by ELK and rendering. Producer dimensions
 * are minimum requests: a card expands instead of compressing its content.
 */
export function measureNodeSystemCard(
  node: NodeSystemNode,
  measureText?: NodeSystemTextMeasurer,
): NodeSystemCardSize {
  return measureCard(node, measureText).size
}

/** Stable geometry fingerprint for deciding whether ELK must run again. */
export function nodeSystemGeometryKey(
  document: Pick<NodeSystemDocument, "nodes">,
  measureText?: NodeSystemTextMeasurer,
): string {
  const measured = memoizedTextMeasurer(measureText)
  return JSON.stringify([...document.nodes]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((node) => {
      const size = measureNodeSystemCard(node, measured)
      const card = planNodeSystemCard(node, {x: 0, y: 0, w: size.width, h: size.height}, 1, measured)
      return [
        node.id,
        rounded(size.width),
        rounded(size.height),
        card.ports.map(({port, marker}) => [
          port.id,
          rounded(marker.x + marker.w / 2),
          rounded(marker.y + marker.h / 2),
        ]),
      ]
    }))
}

function measureCard(
  node: NodeSystemNode,
  measureText?: NodeSystemTextMeasurer,
): NodeSystemCardMeasurement {
  const metrics = NODE_SYSTEM_CARD_METRICS
  const rows = [
    ...(node.summary === undefined ? [] : [metrics.summaryRowHeight]),
    ...(node.facts ?? []).map(() => metrics.factRowHeight),
    ...(node.ports ?? []).map(() => metrics.portRowHeight),
  ]
  const rowsHeight = rows.reduce((sum, height) => sum + height, 0)
    + Math.max(0, rows.length - 1) * metrics.rowGap
  const bodyHeight = Math.max(
    metrics.minimumBodyHeight,
    metrics.bodyPaddingY * 2 + rowsHeight,
  )
  const exact = measureText !== undefined
  const textWidth = (value: string, fontPx: number): number => {
    if (measureText === undefined) return 0
    const width = measureText(value, fontPx)
    return Number.isFinite(width) && width > 0 ? width : 0
  }
  const kindWidth = node.kind === undefined ? 0 : textWidth(node.kind, metrics.metaFontPx)
  const factLabelWidths = new Map((node.facts ?? []).map((fact) => [
    fact.id,
    textWidth(fact.label, metrics.bodyFontPx),
  ]))
  const portDirectionWidths = new Map((node.ports ?? []).map((port) => [
    port.id,
    textWidth(port.direction, metrics.metaFontPx),
  ]))
  const intrinsicRows = exact ? [
    metrics.contentPaddingX * 2
      + textWidth(node.title, metrics.titleFontPx)
      + (node.kind === undefined ? 0 : metrics.rowGap + kindWidth),
    ...(node.summary === undefined ? [] : [
      metrics.contentPaddingX * 2 + textWidth(node.summary, metrics.bodyFontPx),
    ]),
    ...(node.facts ?? []).map((fact) => metrics.contentPaddingX * 2
      + (factLabelWidths.get(fact.id) ?? 0)
      + metrics.rowGap
      + textWidth(fact.value, metrics.bodyFontPx)),
    ...(node.ports ?? []).map((port) => metrics.contentPaddingX * 2
      + textWidth(port.label ?? port.id, metrics.bodyFontPx)
      + (portDirectionWidths.get(port.id) ?? 0)
      + metrics.rowGap * 4),
  ] : []
  const intrinsicWidth = exact
    ? Math.max(metrics.minimumWidth, ...intrinsicRows)
    : metrics.defaultWidth
  const clampedIntrinsicWidth = Math.min(metrics.maximumWidth, intrinsicWidth)
  return {
    size: {
      width: Math.max(metrics.minimumWidth, node.width ?? 0, clampedIntrinsicWidth),
      height: Math.max(metrics.headerHeight + bodyHeight, node.height ?? 0),
    },
    exact,
    kindWidth,
    factLabelWidths,
    portDirectionWidths,
  }
}

/** Builds every internal card slot through the project Flex layout engine. */
export function planNodeSystemCard(
  node: NodeSystemNode,
  frame: NodeSystemRect,
  scale = 1,
  measureText?: NodeSystemTextMeasurer,
): NodeSystemCardPlan {
  const unit = Number.isFinite(scale) && scale > 0 ? scale : 1
  const metrics = scaledMetrics(unit)
  const measurement = measureCard(node, measureText)
  let header = emptyRect(frame.x, frame.y)
  let body = emptyRect(frame.x, frame.y)
  let title = emptyRect(frame.x, frame.y)
  let kind: NodeSystemRect | undefined
  let summary: NodeSystemRect | undefined
  const facts: NodeSystemCardFactSlot[] = []
  const ports: NodeSystemCardPortSlot[] = []

  flexColumn({
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    items: [
      {
        height: metrics.headerHeight,
        draw: (x, y, w, h) => {
          header = {x, y, w, h}
          flexRow({
            x,
            y,
            w,
            h,
            paddingLeft: metrics.contentPaddingX,
            paddingRight: metrics.contentPaddingX,
            gap: metrics.rowGap,
            alignItems: "stretch",
            items: [
              {width: "grow", height: h, draw: (slotX, slotY, slotW, slotH) => {
                title = {x: slotX, y: slotY, w: slotW, h: slotH}
              }},
              node.kind === undefined ? false : {
                width: Math.min(
                  measurement.exact ? measurement.kindWidth * unit : metrics.kindWidth,
                  Math.max(0, w * 0.36),
                ),
                height: h,
                draw: (slotX, slotY, slotW, slotH) => {
                  kind = {x: slotX, y: slotY, w: slotW, h: slotH}
                },
              },
            ],
          })
        },
      },
      {
        height: "grow",
        draw: (x, y, w, h) => {
          body = {x, y, w, h}
          flexColumn({
            x,
            y,
            w,
            h,
            paddingTop: metrics.bodyPaddingY,
            paddingBottom: metrics.bodyPaddingY,
            gap: metrics.rowGap,
            items: [
              node.summary === undefined ? false : {
                height: metrics.summaryRowHeight,
                draw: (slotX, slotY, slotW, slotH) => {
                  flexRow({
                    x: slotX,
                    y: slotY,
                    w: slotW,
                    h: slotH,
                    paddingLeft: metrics.contentPaddingX,
                    paddingRight: metrics.contentPaddingX,
                    items: [{width: "grow", height: slotH, draw: (textX, textY, textW, textH) => {
                      summary = {x: textX, y: textY, w: textW, h: textH}
                    }}],
                  })
                },
              },
              ...(node.facts ?? []).map((fact) => ({
                height: metrics.factRowHeight,
                draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
                  const row = {x: slotX, y: slotY, w: slotW, h: slotH}
                  let label = emptyRect(slotX, slotY)
                  let value = emptyRect(slotX, slotY)
                  flexRow({
                    x: slotX,
                    y: slotY,
                    w: slotW,
                    h: slotH,
                    paddingLeft: metrics.contentPaddingX,
                    paddingRight: metrics.contentPaddingX,
                    gap: metrics.rowGap,
                    items: [
                      {
                        width: measurement.exact
                          ? Math.min((measurement.factLabelWidths.get(fact.id) ?? 0) * unit, slotW * 0.45)
                          : "1fr",
                        height: slotH,
                        draw: (x, y, w, h) => { label = {x, y, w, h} },
                      },
                      {width: measurement.exact ? "grow" : "2fr", height: slotH, draw: (x, y, w, h) => { value = {x, y, w, h} }},
                    ],
                  })
                  facts.push({fact, row, label, value})
                },
              })),
              ...orderedPorts(node).map((port) => ({
                height: metrics.portRowHeight,
                draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
                  ports.push(planPortRow(
                    port,
                    {x: slotX, y: slotY, w: slotW, h: slotH},
                    metrics,
                    measurement.exact ? (measurement.portDirectionWidths.get(port.id) ?? 0) * unit : undefined,
                  ))
                },
              })),
            ],
          })
        },
      },
    ],
  })

  return {
    frame,
    header,
    body,
    title,
    facts,
    ports,
    ...(kind === undefined ? {} : {kind}),
    ...(summary === undefined ? {} : {summary}),
  }
}

function planPortRow(
  port: NodeSystemPort,
  row: NodeSystemRect,
  metrics: ReturnType<typeof scaledMetrics>,
  measuredDirectionWidth?: number,
): NodeSystemCardPortSlot {
  let markerAnchor = emptyRect(row.x, row.y)
  let label = emptyRect(row.x, row.y)
  let direction = emptyRect(row.x, row.y)
  const edgeItem = {width: 0 as const, height: row.h, draw: (x: number, y: number, w: number, h: number) => {
    markerAnchor = {x, y, w, h}
  }}
  const insetItem = {width: metrics.contentPaddingX, height: row.h, draw: () => {}}
  const labelItem = {width: "grow" as const, height: row.h, draw: (x: number, y: number, w: number, h: number) => {
    label = {x, y, w, h}
  }}
  const directionItem = {width: Math.min(measuredDirectionWidth ?? metrics.kindWidth * 0.5, row.w * 0.22), height: row.h, draw: (x: number, y: number, w: number, h: number) => {
    direction = {x, y, w, h}
  }}
  const incoming = port.direction === "in"
  flexRow({
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    gap: metrics.rowGap,
    alignItems: "stretch",
    items: incoming
      ? [edgeItem, insetItem, labelItem, directionItem, insetItem]
      : [insetItem, directionItem, labelItem, insetItem, edgeItem],
  })
  return {
    port,
    row,
    marker: {
      x: markerAnchor.x - metrics.markerSize / 2,
      y: markerAnchor.y + (markerAnchor.h - metrics.markerSize) / 2,
      w: metrics.markerSize,
      h: metrics.markerSize,
    },
    label,
    direction,
  }
}

function orderedPorts(node: NodeSystemNode): readonly NodeSystemPort[] {
  return [...(node.ports ?? [])].sort((left, right) => compareIds(left.id, right.id))
}

function scaledMetrics(scale: number): typeof NODE_SYSTEM_CARD_METRICS {
  return Object.fromEntries(
    Object.entries(NODE_SYSTEM_CARD_METRICS).map(([key, value]) => [key, value * scale]),
  ) as unknown as typeof NODE_SYSTEM_CARD_METRICS
}

function emptyRect(x: number, y: number): NodeSystemRect {
  return {x, y, w: 0, h: 0}
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

/** Per-pass cache: font or scale changes get a fresh cache and therefore a fresh key. */
export function memoizedTextMeasurer(
  measureText?: NodeSystemTextMeasurer,
): NodeSystemTextMeasurer | undefined {
  if (measureText === undefined) return undefined
  const cache = new Map<string, number>()
  return (value, fontPx) => {
    const key = `${fontPx}\u0000${value}`
    const known = cache.get(key)
    if (known !== undefined) return known
    const width = measureText(value, fontPx)
    cache.set(key, width)
    return width
  }
}
