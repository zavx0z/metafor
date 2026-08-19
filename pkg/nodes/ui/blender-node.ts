import {Color} from "@metafor/engine"
import {
  Field,
  Typography,
  measureFieldHeight,
  type FieldColor,
  type FieldDefinition,
} from "@ui/components"
import {Z, palette} from "@ui/elements"
import {sampleNodeSystemBezierPath} from "./edge-curve.ts"
import type {
  Link,
  LinkRenderer,
  Node,
  NodeEditorRenderers,
  NodeRenderer,
  Socket,
  SocketRenderer,
  SocketRendererContext,
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
  const fields = nodeFields(node)
  const fieldHeight = fields.reduce((height, field) => height + measureFieldHeight(field), 0)
    + Math.max(0, fields.length - 1) * NODE_GAP
  const sockets = node.sockets ?? []
  const socketRows = Math.max(
    sockets.filter(({direction}) => direction !== "output").length,
    sockets.filter(({direction}) => direction !== "input").length,
  )
  return {
    width: NODE_MIN_WIDTH,
    height: Math.max(NODE_MIN_HEIGHT, NODE_HEADER_HEIGHT + NODE_PADDING * 2 + Math.max(fieldHeight, socketRows * 24)),
  }
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
    host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius,
      fill: container ? fade(palette.bgPanelDim, 0.72) : palette.bgPanel,
      border: selected ? palette.windowActiveBorder : container ? palette.border : palette.borderDim,
      borderWidth: selected ? Math.max(1.5, 2 * scale) : Math.max(1, scale),
      z: Z.ELEMENT,
    })
    host.drawRoundedRect(rect.x, rect.y, rect.w, Math.min(rect.h, NODE_HEADER_HEIGHT * scale), {
      radius,
      fill: fade(header, container ? 0.35 : 0.58),
      border: null,
      z: Z.ELEMENT + 0.01,
    })
  },
  renderForeground({host, entry, scale, selected}) {
    const {rect, node} = entry
    const headerHeight = NODE_HEADER_HEIGHT * scale
    Typography(host, rect.x + 11 * scale, rect.y, Math.max(1, rect.w - 22 * scale), headerHeight, {
      children: node.label ?? node.title,
      fontPx: Math.max(9, 12 * scale),
      color: selected ? "cyan" : "text",
    })
    if (node.category !== undefined) {
      Typography(host, rect.x + rect.w * 0.52, rect.y, rect.w * 0.43, headerHeight, {
        children: node.category,
        fontPx: Math.max(8, 9 * scale),
        color: "muted",
        sx: {textAlign: "right"},
      })
    }
    if (!node.collapsed && scale >= 0.68) {
      let y = rect.y + headerHeight + NODE_PADDING * scale
      const x = rect.x + NODE_PADDING * scale
      const width = Math.max(1, rect.w - NODE_PADDING * 2 * scale)
      for (const field of nodeFields(node)) {
        const height = Field(host, x, y, width, field)
        y += height + NODE_GAP * scale
      }
    }
    for (const positioned of entry.sockets) {
      const {socket, center, side} = positioned
      const labelWidth = Math.max(30, rect.w * 0.42)
      if (side === "left") {
        Typography(host, center.x + 10, center.y - 9, labelWidth, 18, {children: socket.label, variant: "caption"})
      } else if (side === "right") {
        Typography(host, center.x - labelWidth - 10, center.y - 9, labelWidth, 18, {
          children: socket.label,
          variant: "caption",
          sx: {textAlign: "right"},
        })
      } else {
        Typography(host, center.x - labelWidth / 2, side === "top" ? center.y + 7 : center.y - 24, labelWidth, 18, {
          children: socket.label,
          variant: "caption",
          sx: {textAlign: "center"},
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

function nodeFields(node: BlenderNode): readonly FieldDefinition[] {
  const fields = new Map<string, FieldDefinition>()
  for (const field of node.properties ?? []) fields.set(field.id, field)
  for (const socket of node.sockets ?? []) {
    if (socket.field !== undefined && !fields.has(socket.field.id)) fields.set(socket.field.id, socket.field)
  }
  return [...fields.values()]
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
