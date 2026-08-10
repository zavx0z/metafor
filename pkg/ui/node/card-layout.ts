import {flexColumn, flexRow} from "@ui/elements"
import type {
  NodeSystemFact,
  NodeSystemDocument,
  NodeSystemNode,
  NodeSystemPort,
  NodeSystemPortSide,
  NodeSystemRect,
} from "./types/model.ts"
import type {
  NodeSystemCardFactSlot,
  NodeSystemCardMeasurement,
  NodeSystemCardPlan,
  NodeSystemCardPortSlot,
  NodeSystemCardSize,
  NodeSystemTextMeasurer,
} from "./types/card.ts"

export const NODE_SYSTEM_CARD_METRICS = Object.freeze({
  defaultWidth: 260,
  minimumWidth: 180,
  maximumWidth: 520,
  minimumBodyHeight: 32,
  headerHeight: 34,
  bodyPaddingY: 10,
  rowGap: 4,
  summaryRowHeight: 22,
  factRowHeight: 24,
  titleFontPx: 12,
  metaFontPx: 9,
  bodyFontPx: 9,
  kindWidth: 78,
  contentPaddingX: 12,
  markerSize: 8,
  fieldControlMinWidth: 92,
  fieldControlPaddingX: 10,
})

/** Vertical center-to-center rhythm shared by adjacent card ports and routes. */
export const NODE_SYSTEM_PORT_PITCH =
  NODE_SYSTEM_CARD_METRICS.factRowHeight + NODE_SYSTEM_CARD_METRICS.rowGap

/**
 * One intrinsic metric model shared by the layout engine and rendering. Producer dimensions
 * are minimum requests: a card expands instead of compressing its content.
 */
export function measureNodeSystemCard(
  node: NodeSystemNode,
  measureText?: NodeSystemTextMeasurer,
): NodeSystemCardSize {
  return measureCard(node, measureText).size
}

/** Stable geometry fingerprint for deciding whether layout must run again. */
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
        node.parentId ?? null,
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
      + Math.max(
        metrics.fieldControlMinWidth,
        textWidth(fact.value, metrics.bodyFontPx) + metrics.fieldControlPaddingX * 2,
      )),
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
                width: measurement.exact
                  ? measurement.kindWidth * unit
                  : Math.min(metrics.kindWidth, Math.max(0, w * 0.36)),
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
                          ? (measurement.factLabelWidths.get(fact.id) ?? 0) * unit
                          : "1fr",
                        height: slotH,
                        draw: (x, y, w, h) => { label = {x, y, w, h} },
                      },
                      {width: measurement.exact ? "grow" : "2fr", height: slotH, draw: (x, y, w, h) => { value = {x, y, w, h} }},
                    ],
                  })
                  facts.push({fact, row, label, value})
                  for (const port of parameterPorts(node, fact.id)) {
                    ports.push(planParameterPort(port, row, metrics))
                  }
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

function planParameterPort(
  port: NodeSystemPort,
  row: NodeSystemRect,
  metrics: ReturnType<typeof scaledMetrics>,
): NodeSystemCardPortSlot {
  const left = port.side === "left" || (port.side === undefined && port.direction === "in")
  return {
    port,
    row,
    marker: {
      x: (left ? row.x : row.x + row.w) - metrics.markerSize / 2,
      y: row.y + (row.h - metrics.markerSize) / 2,
      w: metrics.markerSize,
      h: metrics.markerSize,
    },
  }
}

function parameterPorts(node: NodeSystemNode, parameterId: string): readonly NodeSystemPort[] {
  return (node.ports ?? [])
    .filter((port) => port.parameterId === parameterId)
    .sort((left, right) => portVisualSide(left).localeCompare(portVisualSide(right)) || compareIds(left.id, right.id))
}

function portVisualSide(port: NodeSystemPort): NodeSystemPortSide {
  if (port.side !== undefined) return port.side
  return port.direction === "in" ? "left" : "right"
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
