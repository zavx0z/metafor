import {Color} from "@metafor/engine"
import {
  Field,
  Typography,
  measureFieldHeight,
  type FieldColor,
  type FieldDefinition,
} from "@ui/components"
import {Z, flexColumn, flexRow, palette} from "@ui/elements"
import {sampleNodeSystemBezierPath} from "./edge-curve.ts"
import type {
  Link,
  LinkRenderer,
  Node,
  NodeEditorRenderers,
  NodeRenderer,
  NodeRect,
  PositionedNode,
  PositionedSocket,
  Socket,
  SocketRenderer,
  SocketRendererContext,
  SocketSide,
} from "./node-editor.ts"

export const BLENDER_SOCKET_KINDS = Object.freeze([
  "boolean",
  "float",
  "integer",
  "vector",
  "rotation",
  "color",
  "string",
  "menu",
  "object",
  "collection",
  "image",
  "material",
  "texture",
  "geometry",
  "matrix",
  "shader",
  "bundle",
  "closure",
  "custom",
] as const)

export type BlenderSocketKind = typeof BLENDER_SOCKET_KINDS[number]

export const BLENDER_SOCKET_SHAPES = Object.freeze([
  "circle",
  "square",
  "diamond",
  "circle-dot",
  "square-dot",
  "diamond-dot",
] as const)

export type BlenderSocketShape = typeof BLENDER_SOCKET_SHAPES[number]

export type BlenderSocketPreset = Readonly<{
  kind: BlenderSocketKind
  label: string
  color: FieldColor
  shape: BlenderSocketShape
  defaultFieldKind?: FieldDefinition["kind"]
}>

export type BlenderSocket = Socket & Readonly<{
  label: string
  socketType: BlenderSocketKind
  shape?: BlenderSocketShape
  field?: FieldDefinition
  side?: SocketSide
  description?: string
}>

export type BlenderNode = Node & Readonly<{
  title: string
  label?: string
  category?: string
  headerColor?: FieldColor
  properties?: readonly FieldDefinition[]
  sockets?: readonly BlenderSocket[]
  collapsed?: boolean
}>

export type BlenderLink = Link & Readonly<{
  label?: string
  socketType?: BlenderSocketKind
}>

export type BlenderNodePlan = Readonly<{
  header: NodeRect
  body: NodeRect
  fields: readonly Readonly<{field: FieldDefinition; rect: NodeRect}>[]
  sockets: readonly PositionedSocket<BlenderSocket>[]
}>

export const BLENDER_SOCKET_PRESETS: Readonly<Record<BlenderSocketKind, BlenderSocketPreset>> = Object.freeze({
  boolean: preset("boolean", "Boolean", [0.86, 0.33, 0.52], "circle", "boolean"),
  float: preset("float", "Float", [0.62, 0.62, 0.62], "circle", "number"),
  integer: preset("integer", "Integer", [0.36, 0.62, 0.42], "circle", "number"),
  vector: preset("vector", "Vector", [0.39, 0.54, 0.92], "circle", "vector"),
  rotation: preset("rotation", "Rotation", [0.58, 0.42, 0.88], "diamond", "rotation"),
  color: preset("color", "Color", [0.92, 0.78, 0.24], "circle", "color"),
  string: preset("string", "String", [0.42, 0.72, 0.72], "circle", "text"),
  menu: preset("menu", "Menu", [0.38, 0.42, 0.48], "diamond", "enum"),
  object: preset("object", "Object", [0.93, 0.49, 0.22], "circle", "reference"),
  collection: preset("collection", "Collection", [0.88, 0.88, 0.88], "square", "reference"),
  image: preset("image", "Image", [0.58, 0.42, 0.84], "circle", "reference"),
  material: preset("material", "Material", [0.83, 0.25, 0.30], "circle", "reference"),
  texture: preset("texture", "Texture", [0.73, 0.44, 0.20], "circle", "reference"),
  geometry: preset("geometry", "Geometry", [0.22, 0.68, 0.57], "diamond"),
  matrix: preset("matrix", "Matrix", [0.36, 0.57, 0.80], "square", "matrix"),
  shader: preset("shader", "Shader", [0.33, 0.78, 0.38], "circle"),
  bundle: preset("bundle", "Bundle", [0.18, 0.62, 0.68], "square-dot"),
  closure: preset("closure", "Closure", [0.67, 0.44, 0.29], "diamond-dot"),
  custom: preset("custom", "Custom", [0.84, 0.35, 0.82], "circle-dot"),
})

const NODE_HEADER_HEIGHT = 34
const NODE_PADDING = 10
const NODE_GAP = 7
const NODE_MIN_WIDTH = 190
const NODE_MIN_HEIGHT = 72

export function blenderSocketPreset(kind: BlenderSocketKind): BlenderSocketPreset {
  return BLENDER_SOCKET_PRESETS[kind]
}

export function measureBlenderNode(node: BlenderNode): Readonly<{width: number; height: number}> {
  const rows = blenderNodeRows(node)
  const rowsHeight = rows.reduce((height, row) => height + rowHeight(row), 0)
    + Math.max(0, rows.length - 1) * NODE_GAP
  return {
    width: NODE_MIN_WIDTH,
    height: Math.max(NODE_MIN_HEIGHT, NODE_HEADER_HEIGHT + NODE_PADDING * 2 + rowsHeight),
  }
}

/** Plans Standard Node child slots and exact Socket anchors through shared Flex. */
export function planBlenderNode(node: BlenderNode, frame: NodeRect, scale = 1): BlenderNodePlan {
  const regions = blenderNodeRegions(frame, scale)
  const fields: Array<{field: FieldDefinition; rect: NodeRect}> = []
  const sockets: PositionedSocket<BlenderSocket>[] = []
  const rows = blenderNodeRows(node)
  flexColumn({
    x: regions.body.x,
    y: regions.body.y,
    w: regions.body.w,
    h: regions.body.h,
    paddingX: NODE_PADDING * scale,
    paddingY: NODE_PADDING * scale,
    gap: NODE_GAP * scale,
    items: rows.map((row) => ({
      height: rowHeight(row),
      draw: (x: number, y: number, w: number, h: number) => {
        const rect = {x, y, w, h}
        if (row.field !== undefined) fields.push({field: row.field, rect})
        if (row.socket !== undefined) sockets.push({
          socket: row.socket,
          side: socketSide(row.socket),
          center: socketCenter(frame, rect, row.socket),
        })
      },
    })),
  })
  return {header: regions.header, body: regions.body, fields, sockets}
}

export function positionBlenderNode(node: BlenderNode, rect: NodeRect): PositionedNode<BlenderNode, BlenderSocket> {
  return {node, rect, sockets: planBlenderNode(node, rect).sockets}
}

export function createBlenderNodeRenderers(): NodeEditorRenderers<BlenderNode, BlenderSocket, BlenderLink> {
  return {node: blenderNodeRenderer, socket: blenderSocketRenderer, link: blenderLinkRenderer}
}

export const blenderNodeRenderer: NodeRenderer<BlenderNode, BlenderSocket> = Object.freeze({
  measure: measureBlenderNode,
  renderBackground({host, entry, scale, selected, container}) {
    const {rect, node} = entry
    const radius = Math.max(5, 9 * scale)
    const header = nodeHeaderColor(node)
    const regions = blenderNodeRegions(rect, scale)
    host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius,
      fill: container ? fade(palette.bgPanelDim, 0.72) : palette.bgPanel,
      border: selected ? palette.windowActiveBorder : container ? palette.border : palette.borderDim,
      borderWidth: selected ? Math.max(1.5, 2 * scale) : Math.max(1, scale),
      z: Z.ELEMENT,
    })
    host.drawRoundedRect(regions.header.x, regions.header.y, regions.header.w, regions.header.h, {
      radius,
      fill: fade(header, container ? 0.35 : 0.58),
      border: null,
      z: Z.ELEMENT + 0.01,
    })
  },
  renderForeground({host, entry, scale, selected}) {
    const {rect, node} = entry
    const regions = blenderNodeRegions(rect, scale)
    flexRow({
      x: regions.header.x,
      y: regions.header.y,
      w: regions.header.w,
      h: regions.header.h,
      paddingX: 11 * scale,
      gap: 8 * scale,
      alignItems: "stretch",
      items: [
        {width: "grow", height: regions.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.label ?? node.title,
          fontPx: Math.max(9, 12 * scale),
          color: selected ? "cyan" : "text",
        })},
        node.category === undefined ? false : {width: "1fr", height: regions.header.h, draw: (slotX: number, slotY: number, slotW: number, slotH: number) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.category!,
          fontPx: Math.max(8, 9 * scale),
          color: "muted",
          sx: {textAlign: "right"},
        })},
      ],
    })
    if (!node.collapsed && scale >= 0.68) {
      for (const {field, rect: slot} of planBlenderNode(node, rect, scale).fields) {
        Field(host, slot.x, slot.y, slot.w, {...field, key: `${node.id}:${field.id}`})
      }
    }
    for (const positioned of entry.sockets) {
      const {socket, center, side} = positioned
      if (socket.field !== undefined) continue
      if (side === "left") {
        drawSideSocketLabel(host, rect, center.y, socket.label, "left")
      } else if (side === "right") {
        drawSideSocketLabel(host, rect, center.y, socket.label, "right")
      } else {
        flexRow({
          x: rect.x,
          y: side === "top" ? rect.y + 7 : rect.y + rect.h - 24,
          w: rect.w,
          h: 18,
          justifyContent: "center",
          items: [{width: Math.min(140, rect.w - 20), height: 18, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
            children: socket.label,
            variant: "caption",
            sx: {textAlign: "center"},
          })}],
        })
      }
    }
  },
})

export const blenderSocketRenderer: SocketRenderer<BlenderSocket> = Object.freeze({
  render({host, entry, scale, selected}) {
    const socketPreset = blenderSocketPreset(entry.socket.socketType)
    drawSocketShape(
      host,
      entry.center.x,
      entry.center.y,
      Math.max(7, 10 * scale),
      entry.socket.shape ?? socketPreset.shape,
      colorFrom(socketPreset.color),
      selected,
    )
  },
})

export const blenderLinkRenderer: LinkRenderer<BlenderLink> = Object.freeze({
  render({host, entry, scale, selected}) {
    const socketPreset = blenderSocketPreset(entry.link.socketType ?? "custom")
    const stroke = sampleNodeSystemBezierPath(entry.points, 10 * scale, 6)
    host.drawPolyline(stroke, colorFrom(socketPreset.color), Math.max(selected ? 3 : 2, 2.2 * scale), Z.ELEMENT + 0.02)
  },
})

type BlenderNodeRow = Readonly<{field?: FieldDefinition; socket?: BlenderSocket}>

function blenderNodeRows(node: BlenderNode): readonly BlenderNodeRow[] {
  const rows: BlenderNodeRow[] = []
  const fieldIds = new Set<string>()
  for (const field of node.properties ?? []) {
    const socket = (node.sockets ?? []).find((candidate) => candidate.field?.id === field.id)
    rows.push({field, ...(socket === undefined ? {} : {socket})})
    fieldIds.add(field.id)
  }
  for (const socket of node.sockets ?? []) {
    if (socket.field === undefined) rows.push({socket})
    else if (!fieldIds.has(socket.field.id)) {
      rows.push({field: socket.field, socket})
      fieldIds.add(socket.field.id)
    }
  }
  return rows
}

function rowHeight(row: BlenderNodeRow): number {
  return row.field === undefined ? 24 : measureFieldHeight(row.field)
}

function socketSide(socket: BlenderSocket): SocketSide {
  if (socket.side !== undefined) return socket.side
  if (socket.direction === "input") return "left"
  return "right"
}

function socketCenter(
  nodeRect: NodeRect,
  rowRect: NodeRect,
  socket: BlenderSocket,
): Readonly<{x: number; y: number}> {
  const side = socketSide(socket)
  const controlCenterY = rowRect.y + rowRect.h / 2
  if (side === "left") return {x: nodeRect.x, y: controlCenterY}
  if (side === "right") return {x: nodeRect.x + nodeRect.w, y: controlCenterY}
  if (side === "top") return {x: rowRect.x + rowRect.w / 2, y: nodeRect.y}
  return {x: rowRect.x + rowRect.w / 2, y: nodeRect.y + nodeRect.h}
}

function blenderNodeRegions(rect: Readonly<{x: number; y: number; w: number; h: number}>, scale: number): Readonly<{
  header: Readonly<{x: number; y: number; w: number; h: number}>
  body: Readonly<{x: number; y: number; w: number; h: number}>
}> {
  let header = {x: rect.x, y: rect.y, w: rect.w, h: 0}
  let body = {x: rect.x, y: rect.y, w: rect.w, h: rect.h}
  flexColumn({
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    items: [
      {height: NODE_HEADER_HEIGHT * scale, draw: (x, y, w, h) => { header = {x, y, w, h} }},
      {height: "grow", draw: (x, y, w, h) => { body = {x, y, w, h} }},
    ],
  })
  return {header, body}
}

function drawSideSocketLabel(
  host: SocketRendererContext<BlenderSocket>["host"],
  rect: Readonly<{x: number; y: number; w: number; h: number}>,
  centerY: number,
  label: string,
  side: "left" | "right",
): void {
  flexRow({
    x: rect.x,
    y: centerY - 9,
    w: rect.w,
    h: 18,
    paddingX: 10,
    gap: 10,
    items: side === "left" ? [
      {width: "1fr", height: 18, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, variant: "caption"})},
      {width: "1fr", height: 18, draw: () => {}},
    ] : [
      {width: "1fr", height: 18, draw: () => {}},
      {width: "1fr", height: 18, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, variant: "caption", sx: {textAlign: "right"}})},
    ],
  })
}

function drawSocketShape(
  host: SocketRendererContext<BlenderSocket>["host"],
  cx: number,
  cy: number,
  size: number,
  shape: BlenderSocketShape,
  color: Color,
  selected: boolean,
): void {
  const baseShape = shape.replace("-dot", "") as "circle" | "square" | "diamond"
  const border = selected ? palette.windowActiveBorder : palette.bg
  if (baseShape === "circle" || baseShape === "square") {
    host.drawRoundedRect(cx - size / 2, cy - size / 2, size, size, {
      radius: baseShape === "circle" ? size / 2 : Math.max(1, size * 0.16),
      fill: color,
      border,
      borderWidth: Math.max(1, size * 0.14),
      z: Z.TEXT + 0.03,
    })
  } else {
    const half = size * 0.62
    host.drawPolyline([
      {x: cx, y: cy - half},
      {x: cx + half, y: cy},
      {x: cx, y: cy + half},
      {x: cx - half, y: cy},
      {x: cx, y: cy - half},
    ], color, Math.max(2, size * 0.32), Z.TEXT + 0.03)
  }
  if (shape.endsWith("-dot")) {
    const dot = Math.max(2.5, size * 0.28)
    host.drawRoundedRect(cx - dot / 2, cy - dot / 2, dot, dot, {
      radius: dot / 2,
      fill: palette.bg,
      border: null,
      z: Z.TEXT + 0.04,
    })
  }
}

function preset(
  kind: BlenderSocketKind,
  label: string,
  rgb: readonly [number, number, number],
  shape: BlenderSocketShape,
  defaultFieldKind?: FieldDefinition["kind"],
): BlenderSocketPreset {
  return {
    kind,
    label,
    color: {r: rgb[0], g: rgb[1], b: rgb[2], a: 1},
    shape,
    ...(defaultFieldKind === undefined ? {} : {defaultFieldKind}),
  }
}

function nodeHeaderColor(node: BlenderNode): Color {
  return node.headerColor === undefined ? palette.bgHot : colorFrom(node.headerColor)
}

function colorFrom(value: FieldColor): Color {
  return new Color(value.r, value.g, value.b, value.a)
}

function fade(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * alpha)))
}
