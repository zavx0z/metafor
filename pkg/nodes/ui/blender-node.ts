import {Color} from "@metafor/engine"
import {
  Field,
  Typography,
  measureFieldHeight,
  type FieldColor,
  type FieldDefinition,
} from "@ui/components"
import {Z, flexColumn, flexRow, palette} from "@ui/elements"
import {sampleLinkBezierPath} from "./link-curve.ts"
import type {
  Frame,
  FrameRenderer,
  Link,
  LinkRenderer,
  Node,
  Parameter,
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
  "line",
  "volume-grid",
] as const)

export type BlenderSocketShape = typeof BLENDER_SOCKET_SHAPES[number]

export type BlenderSocketPreset = Readonly<{
  kind: BlenderSocketKind
  label: string
  color: FieldColor
  shape: BlenderSocketShape
  defaultFieldKind?: FieldDefinition["kind"]
}>

export type BlenderFrame = Frame & Readonly<{
  label: string
  color?: FieldColor
  labelSize?: number
}>

export type BlenderSocket = Socket & Readonly<{
  label: string
  socketType: BlenderSocketKind
  shape?: BlenderSocketShape
  side?: SocketSide
  description?: string
}>

export type BlenderParameter = Parameter & Readonly<{
  label: string
  field?: FieldDefinition
  description?: string
}>

export type BlenderNode = Omit<Node, "parameters"> & Readonly<{
  title: string
  label?: string
  category?: string
  headerColor?: FieldColor
  properties?: readonly FieldDefinition[]
  parameters?: readonly BlenderParameter[]
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
  fields: readonly Readonly<{field: FieldDefinition; rect: NodeRect; parameterId?: string}>[]
  parameters: readonly Readonly<{parameter: BlenderParameter; rect: NodeRect}>[]
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

const NODE_HEADER_HEIGHT = 24
const NODE_PADDING = 8
const NODE_GAP = 3
const NODE_MIN_WIDTH = 180
const NODE_MIN_HEIGHT = 52

export function blenderSocketPreset(kind: BlenderSocketKind): BlenderSocketPreset {
  return BLENDER_SOCKET_PRESETS[kind]
}

export function measureBlenderNode(node: BlenderNode): Readonly<{width: number; height: number}> {
  if (node.collapsed) {
    const sockets = node.sockets ?? []
    const maxSideCount = Math.max(
      sockets.filter((socket) => socketSide(socket) === "left").length,
      sockets.filter((socket) => socketSide(socket) === "right").length,
    )
    return {width: NODE_MIN_WIDTH, height: Math.max(NODE_HEADER_HEIGHT, maxSideCount * 8 + 10)}
  }
  const rows = blenderNodeRows(node)
  const rowsHeight = rows.reduce((height, row) => height + rowHeight(row), 0)
    + Math.max(0, rows.length - 1) * NODE_GAP
  return {
    width: NODE_MIN_WIDTH,
    height: Math.max(NODE_MIN_HEIGHT, NODE_HEADER_HEIGHT + NODE_PADDING * 2 + rowsHeight),
  }
}

/** Plans Standard Node child slots and exact Socket anchors through shared Flex. */
export function planBlenderNode(node: BlenderNode, frame: NodeRect): BlenderNodePlan {
  if (node.collapsed) return planCollapsedBlenderNode(node, frame)
  const regions = blenderNodeRegions(frame)
  const fields: Array<{field: FieldDefinition; rect: NodeRect; parameterId?: string}> = []
  const parameters: Array<{parameter: BlenderParameter; rect: NodeRect}> = []
  const sockets: PositionedSocket<BlenderSocket>[] = []
  const rows = blenderNodeRows(node)
  flexColumn({
    x: regions.body.x,
    y: regions.body.y,
    w: regions.body.w,
    h: regions.body.h,
    paddingX: NODE_PADDING,
    paddingY: NODE_PADDING,
    gap: NODE_GAP,
    items: rows.map((row) => ({
      height: rowHeight(row),
      draw: (x: number, y: number, w: number, h: number) => {
        const rect = {x, y, w, h}
        if (row.field !== undefined) fields.push({
          field: row.field,
          rect,
          ...(row.parameter === undefined ? {} : {parameterId: row.parameter.id}),
        })
        if (row.parameter !== undefined) parameters.push({parameter: row.parameter, rect})
        for (const socket of row.sockets) sockets.push({
          socket,
          side: socketSide(socket),
          center: socketCenter(frame, rect, socket),
        })
      },
    })),
  })
  return {header: regions.header, body: regions.body, fields, parameters, sockets}
}

function planCollapsedBlenderNode(node: BlenderNode, frame: NodeRect): BlenderNodePlan {
  const sockets: PositionedSocket<BlenderSocket>[] = []
  for (const side of ["left", "right"] as const) {
    const entries = (node.sockets ?? []).filter((socket) => socketSide(socket) === side)
    entries.forEach((socket, index) => sockets.push({
      socket,
      side,
      center: {
        x: side === "left" ? frame.x : frame.x + frame.w,
        y: frame.y + frame.h / 2 + (index - (entries.length - 1) / 2) * 8,
      },
    }))
  }
  return {header: frame, body: {...frame, h: 0}, fields: [], parameters: [], sockets}
}

export function positionBlenderNode(node: BlenderNode, rect: NodeRect): PositionedNode<BlenderNode, BlenderSocket> {
  return {node, rect, sockets: planBlenderNode(node, rect).sockets}
}

export function createBlenderNodeRenderers(): NodeEditorRenderers<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame, BlenderNodePlan> {
  return {frame: blenderFrameRenderer, node: blenderNodeRenderer, socket: blenderSocketRenderer, link: blenderLinkRenderer}
}

export const blenderFrameRenderer: FrameRenderer<BlenderFrame> = Object.freeze({
  renderBackground({host, entry, selected}) {
    const color = entry.frame.color === undefined
      ? new Color(0.16, 0.34, 0.24, 1)
      : colorFrom(entry.frame.color)
    host.drawRoundedRect(entry.rect.x + 3, entry.rect.y + 5, entry.rect.w, entry.rect.h, {
      radius: 7,
      fill: new Color(0, 0, 0, 0.28),
      border: null,
      z: Z.CONTAINER,
    })
    host.drawRoundedRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, {
      radius: 7,
      fill: fade(color, 0.42),
      border: selected ? palette.orange : fade(color, 0.88),
      borderWidth: selected ? 2 : 1,
      z: Z.CONTAINER + 0.04,
    })
  },
  renderForeground({host, entry, selected}) {
    flexRow({
      x: entry.rect.x,
      y: entry.rect.y,
      w: entry.rect.w,
      h: 34,
      justifyContent: "center",
      alignItems: "center",
      items: [{
        width: "grow",
        height: 30,
        draw: (x, y, w, h) => Typography(host, x, y, w, h, {
          children: entry.frame.label,
          fontPx: entry.frame.labelSize ?? 17,
          color: selected ? "orange" : "text",
          sx: {textAlign: "center"},
        }),
      }],
    })
  },
})

export const blenderNodeRenderer: NodeRenderer<BlenderNode, BlenderSocket, BlenderNodePlan> = Object.freeze({
  measure: measureBlenderNode,
  plan({entry}) {
    return planBlenderNode(entry.node, entry.rect)
  },
  render({host, entry, connectedSocketIds, selected, plan}) {
    const {rect, node} = entry
    const header = nodeHeaderColor(node)
    host.drawRoundedRect(rect.x + 3, rect.y + 5, rect.w, rect.h, {
      radius: 6,
      fill: new Color(0, 0, 0, 0.34),
      border: null,
      z: Z.ELEMENT - 0.02,
    })
    host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: 6,
      fill: new Color(0.188, 0.188, 0.188, 1),
      border: selected ? palette.orange : new Color(0.075, 0.075, 0.075, 1),
      borderWidth: selected ? 2 : 1,
      z: Z.ELEMENT,
    })
    host.drawRoundedRect(plan.header.x, plan.header.y, plan.header.w, plan.header.h, {
      radius: 6,
      fill: fade(header, 0.82),
      border: null,
      z: Z.ELEMENT + 0.01,
    })
    flexRow({
      x: plan.header.x,
      y: plan.header.y,
      w: plan.header.w,
      h: plan.header.h,
      paddingX: 6,
      gap: 4,
      alignItems: "stretch",
      items: [
        {width: 12, height: plan.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.collapsed ? "›" : "⌄",
          fontPx: 10,
          color: "text",
        })},
        {width: "grow", height: plan.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.label ?? node.title,
          fontPx: 11,
          color: selected ? "orange" : "text",
        })},
      ],
    })
    const connectedParameterIds = new Set((node.sockets ?? []).flatMap((socket) =>
      socket.parameterId !== undefined && connectedSocketIds.has(socket.id) ? [socket.parameterId] : []))
    if (!node.collapsed) {
      for (const {field, rect: slot, parameterId} of plan.fields) {
        if (parameterId !== undefined && connectedParameterIds.has(parameterId)) continue
        Field(host, slot.x, slot.y, slot.w, {...field, key: `${node.id}:${field.id}`}, {density: "compact"})
      }
      for (const {parameter, rect: slot} of plan.parameters) {
        if (parameter.field !== undefined && !connectedParameterIds.has(parameter.id)) continue
        Typography(host, slot.x, slot.y, slot.w, slot.h, {
          children: parameter.label,
          fontPx: 11,
          sx: {textAlign: "center"},
        })
      }
    }
    for (const positioned of entry.sockets) {
      if (node.collapsed) continue
      const {socket, center, side} = positioned
      if (socket.parameterId !== undefined) continue
      if (side === "left") {
        drawSideSocketLabel(host, rect, center.y, socket.label, "left")
      } else {
        drawSideSocketLabel(host, rect, center.y, socket.label, "right")
      }
    }
  },
})

export const blenderSocketRenderer: SocketRenderer<BlenderSocket> = Object.freeze({
  render({host, entry, selected}) {
    const socketPreset = blenderSocketPreset(entry.socket.socketType)
    drawSocketShape(
      host,
      entry.center.x,
      entry.center.y,
      8,
      entry.socket.shape ?? socketPreset.shape,
      colorFrom(socketPreset.color),
      selected,
    )
  },
})

export const blenderLinkRenderer: LinkRenderer<BlenderLink> = Object.freeze({
  render({host, entry, selected}) {
    const socketPreset = blenderSocketPreset(entry.link.socketType ?? "custom")
    const stroke = sampleLinkBezierPath(entry.points, 10, 6)
    host.drawPolyline(
      stroke,
      colorFrom(socketPreset.color),
      selected ? 3.4 : 2.2,
      Z.ELEMENT + (selected ? 0.05 : 0.02),
    )
  },
})

type BlenderNodeRow = Readonly<{
  field?: FieldDefinition
  parameter?: BlenderParameter
  sockets: readonly BlenderSocket[]
}>

function blenderNodeRows(node: BlenderNode): readonly BlenderNodeRow[] {
  const rows: BlenderNodeRow[] = []
  const looseSockets = (node.sockets ?? []).filter((socket) => socket.parameterId === undefined)
  for (const socket of looseSockets.filter((socket) => socketSide(socket) === "right")) {
    rows.push({sockets: [socket]})
  }
  for (const field of node.properties ?? []) rows.push({field, sockets: []})
  for (const parameter of node.parameters ?? []) rows.push({
    parameter,
    ...(parameter.field === undefined ? {} : {field: parameter.field}),
    sockets: (node.sockets ?? []).filter((socket) => socket.parameterId === parameter.id),
  })
  for (const socket of looseSockets.filter((socket) => socketSide(socket) === "left")) {
    rows.push({sockets: [socket]})
  }
  return rows
}

function rowHeight(row: BlenderNodeRow): number {
  return row.field === undefined ? 22 : measureFieldHeight(row.field, {density: "compact"})
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
  return {x: nodeRect.x + nodeRect.w, y: controlCenterY}
}

function blenderNodeRegions(rect: Readonly<{x: number; y: number; w: number; h: number}>): Readonly<{
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
      {height: NODE_HEADER_HEIGHT, draw: (x, y, w, h) => { header = {x, y, w, h} }},
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
  const height = 18
  flexRow({
    x: rect.x,
    y: centerY - height / 2,
    w: rect.w,
    h: height,
    paddingX: 8,
    gap: 8,
    items: side === "left" ? [
      {width: "1fr", height, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, fontPx: 11})},
      {width: "1fr", height, draw: () => {}},
    ] : [
      {width: "1fr", height, draw: () => {}},
      {width: "1fr", height, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, fontPx: 11, sx: {textAlign: "right"}})},
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
  if (shape === "line") {
    host.drawLine(cx, cy - size * 0.62, cx, cy + size * 0.62, color, size * 0.28, Z.TEXT + 0.03)
    return
  }
  if (shape === "volume-grid") {
    const half = size * 0.54
    host.drawRoundedRect(cx - half, cy - half, half * 2, half * 2, {
      radius: size * 0.12,
      fill: color,
      border: selected ? palette.windowActiveBorder : palette.bg,
      borderWidth: size * 0.14,
      z: Z.TEXT + 0.03,
    })
    host.drawLine(cx, cy - half + 1, cx, cy + half - 1, palette.bg, size * 0.12, Z.TEXT + 0.04)
    host.drawLine(cx - half + 1, cy, cx + half - 1, cy, palette.bg, size * 0.12, Z.TEXT + 0.04)
    return
  }
  const baseShape = shape.replace("-dot", "") as "circle" | "square" | "diamond"
  const border = selected ? palette.windowActiveBorder : palette.bg
  if (baseShape === "circle" || baseShape === "square") {
    host.drawRoundedRect(cx - size / 2, cy - size / 2, size, size, {
      radius: baseShape === "circle" ? size / 2 : size * 0.16,
      fill: color,
      border,
      borderWidth: size * 0.14,
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
    ], color, size * 0.32, Z.TEXT + 0.03)
  }
  if (shape.endsWith("-dot")) {
    const dot = size * 0.28
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
