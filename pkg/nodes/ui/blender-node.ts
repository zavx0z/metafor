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

export function createBlenderNodeRenderers(): NodeEditorRenderers<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> {
  return {frame: blenderFrameRenderer, node: blenderNodeRenderer, socket: blenderSocketRenderer, link: blenderLinkRenderer}
}

export const blenderFrameRenderer: FrameRenderer<BlenderFrame> = Object.freeze({
  renderBackground({host, entry, scale, selected}) {
    const color = entry.frame.color === undefined
      ? new Color(0.16, 0.34, 0.24, 1)
      : colorFrom(entry.frame.color)
    const radius = Math.max(4, 7 * scale)
    host.drawRoundedRect(entry.rect.x + 3 * scale, entry.rect.y + 5 * scale, entry.rect.w, entry.rect.h, {
      radius,
      fill: new Color(0, 0, 0, 0.28),
      border: null,
      z: Z.CONTAINER,
    })
    host.drawRoundedRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, {
      radius,
      fill: fade(color, 0.42),
      border: selected ? palette.orange : fade(color, 0.88),
      borderWidth: Math.max(1, selected ? 2 * scale : scale),
      z: Z.CONTAINER + 0.04,
    })
  },
  renderForeground({host, entry, scale, selected}) {
    flexRow({
      x: entry.rect.x,
      y: entry.rect.y,
      w: entry.rect.w,
      h: Math.max(26, 34 * scale),
      justifyContent: "center",
      alignItems: "center",
      items: [{
        width: "grow",
        height: Math.max(22, 30 * scale),
        draw: (x, y, w, h) => Typography(host, x, y, w, h, {
          children: entry.frame.label,
          fontPx: Math.max(12, (entry.frame.labelSize ?? 17) * scale),
          color: selected ? "orange" : "text",
          sx: {textAlign: "center"},
        }),
      }],
    })
  },
})

export const blenderNodeRenderer: NodeRenderer<BlenderNode, BlenderSocket> = Object.freeze({
  measure: measureBlenderNode,
  renderBackground({host, entry, scale, selected}) {
    const {rect, node} = entry
    const radius = Math.max(3, 6 * scale)
    const header = nodeHeaderColor(node)
    const plan = renderedBlenderNodePlan(node, rect, scale)
    host.drawRoundedRect(rect.x + 3 * scale, rect.y + 5 * scale, rect.w, rect.h, {
      radius,
      fill: new Color(0, 0, 0, 0.34),
      border: null,
      z: Z.ELEMENT - 0.02,
    })
    host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius,
      fill: new Color(0.188, 0.188, 0.188, 1),
      border: selected ? palette.orange : new Color(0.075, 0.075, 0.075, 1),
      borderWidth: selected ? Math.max(1.5, 2 * scale) : Math.max(1, scale),
      z: Z.ELEMENT,
    })
    host.drawRoundedRect(plan.header.x, plan.header.y, plan.header.w, plan.header.h, {
      radius,
      fill: fade(header, 0.82),
      border: null,
      z: Z.ELEMENT + 0.01,
    })
  },
  renderForeground({host, entry, connectedSocketIds, scale, selected}) {
    const {rect, node} = entry
    const plan = renderedBlenderNodePlan(node, rect, scale)
    flexRow({
      x: plan.header.x,
      y: plan.header.y,
      w: plan.header.w,
      h: plan.header.h,
      paddingX: 6 * scale,
      gap: 4 * scale,
      alignItems: "stretch",
      items: [
        {width: 12 * scale, height: plan.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.collapsed ? "›" : "⌄",
          fontPx: Math.max(8, 10 * scale),
          color: "text",
        })},
        {width: "grow", height: plan.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.label ?? node.title,
          fontPx: Math.max(8, 11 * scale),
          color: selected ? "orange" : "text",
        })},
      ],
    })
    const connectedParameterIds = new Set((node.sockets ?? []).flatMap((socket) =>
      socket.parameterId !== undefined && connectedSocketIds.has(socket.id) ? [socket.parameterId] : []))
    if (!node.collapsed && scale >= 0.68) {
      for (const {field, rect: slot, parameterId} of plan.fields) {
        if (parameterId !== undefined && connectedParameterIds.has(parameterId)) continue
        Field(host, slot.x, slot.y, slot.w, {...field, key: `${node.id}:${field.id}`}, {density: "compact", scale})
      }
      for (const {parameter, rect: slot} of plan.parameters) {
        if (parameter.field !== undefined && !connectedParameterIds.has(parameter.id)) continue
        Typography(host, slot.x, slot.y, slot.w, slot.h, {
          children: parameter.label,
          fontPx: Math.max(8, 11 * scale),
          sx: {textAlign: "center"},
        })
      }
    }
    for (const positioned of entry.sockets) {
      if (node.collapsed) continue
      const {socket, center, side} = positioned
      if (socket.parameterId !== undefined) continue
      if (side === "left") {
        drawSideSocketLabel(host, rect, center.y, socket.label, "left", scale)
      } else {
        drawSideSocketLabel(host, rect, center.y, socket.label, "right", scale)
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
      Math.max(5.5, 8 * scale),
      entry.socket.shape ?? socketPreset.shape,
      colorFrom(socketPreset.color),
      selected,
    )
  },
})

export const blenderLinkRenderer: LinkRenderer<BlenderLink> = Object.freeze({
  render({host, entry, scale, selected}) {
    const socketPreset = blenderSocketPreset(entry.link.socketType ?? "custom")
    const stroke = sampleLinkBezierPath(entry.points, 10 * scale, 6)
    host.drawPolyline(stroke, colorFrom(socketPreset.color), Math.max(selected ? 3 : 2, 2.2 * scale), Z.ELEMENT + 0.02)
  },
})

type BlenderNodeRow = Readonly<{
  field?: FieldDefinition
  parameter?: BlenderParameter
  sockets: readonly BlenderSocket[]
}>

function blenderNodeRows(node: BlenderNode): readonly BlenderNodeRow[] {
  const rows: BlenderNodeRow[] = []
  for (const field of node.properties ?? []) rows.push({field, sockets: []})
  for (const parameter of node.parameters ?? []) rows.push({
    parameter,
    ...(parameter.field === undefined ? {} : {field: parameter.field}),
    sockets: (node.sockets ?? []).filter((socket) => socket.parameterId === parameter.id),
  })
  for (const socket of node.sockets ?? []) {
    if (socket.parameterId === undefined) rows.push({sockets: [socket]})
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

function renderedBlenderNodePlan(node: BlenderNode, rect: NodeRect, scale: number): BlenderNodePlan {
  const safeScale = Math.max(0.01, scale)
  const plan = planBlenderNode(node, {x: 0, y: 0, w: rect.w / safeScale, h: rect.h / safeScale})
  const transformRect = (entry: NodeRect): NodeRect => ({
    x: rect.x + entry.x * safeScale,
    y: rect.y + entry.y * safeScale,
    w: entry.w * safeScale,
    h: entry.h * safeScale,
  })
  return {
    header: transformRect(plan.header),
    body: transformRect(plan.body),
    fields: plan.fields.map(({field, rect: slot, parameterId}) => ({
      field,
      rect: transformRect(slot),
      ...(parameterId === undefined ? {} : {parameterId}),
    })),
    parameters: plan.parameters.map(({parameter, rect: slot}) => ({parameter, rect: transformRect(slot)})),
    sockets: plan.sockets.map((entry) => ({
      ...entry,
      center: {
        x: rect.x + entry.center.x * safeScale,
        y: rect.y + entry.center.y * safeScale,
      },
    })),
  }
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
  scale: number,
): void {
  const height = Math.max(12, 18 * scale)
  flexRow({
    x: rect.x,
    y: centerY - height / 2,
    w: rect.w,
    h: height,
    paddingX: 8 * scale,
    gap: 8 * scale,
    items: side === "left" ? [
      {width: "1fr", height, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, fontPx: Math.max(8, 11 * scale)})},
      {width: "1fr", height, draw: () => {}},
    ] : [
      {width: "1fr", height, draw: () => {}},
      {width: "1fr", height, draw: (x, y, w, h) => Typography(host, x, y, w, h, {children: label, fontPx: Math.max(8, 11 * scale), sx: {textAlign: "right"}})},
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
    host.drawLine(cx, cy - size * 0.62, cx, cy + size * 0.62, color, Math.max(2, size * 0.28), Z.TEXT + 0.03)
    return
  }
  if (shape === "volume-grid") {
    const half = size * 0.54
    host.drawRoundedRect(cx - half, cy - half, half * 2, half * 2, {
      radius: Math.max(1, size * 0.12),
      fill: color,
      border: selected ? palette.windowActiveBorder : palette.bg,
      borderWidth: Math.max(1, size * 0.14),
      z: Z.TEXT + 0.03,
    })
    host.drawLine(cx, cy - half + 1, cx, cy + half - 1, palette.bg, Math.max(1, size * 0.12), Z.TEXT + 0.04)
    host.drawLine(cx - half + 1, cy, cx + half - 1, cy, palette.bg, Math.max(1, size * 0.12), Z.TEXT + 0.04)
    return
  }
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
