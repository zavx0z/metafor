import {Color} from "@metafor/engine"
import {
  Field,
  Typography,
  measureFieldLayout,
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
  hideValue?: boolean
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
  rect: NodeRect
  header: NodeRect
  body: NodeRect
  fields: readonly Readonly<{
    field: FieldDefinition
    rect: NodeRect
    editorRect: NodeRect
    parameterId?: string
    editorVisible: boolean
    separateLabel: boolean
  }>[]
  parameters: readonly Readonly<{
    parameter: BlenderParameter
    rect: NodeRect
    side?: SocketSide
    separateLabel: boolean
  }>[]
  sockets: readonly PositionedSocket<BlenderSocket>[]
}>

export const BLENDER_SOCKET_PRESETS: Readonly<Record<BlenderSocketKind, BlenderSocketPreset>> = Object.freeze({
  boolean: preset("boolean", "Boolean", [0.86, 0.33, 0.52], "circle", "boolean"),
  float: preset("float", "Float", [0.62, 0.62, 0.62], "circle", "number"),
  integer: preset("integer", "Integer", [0.36, 0.62, 0.42], "circle", "integer"),
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

export type BlenderSocketVisualPolicy = Readonly<{
  diameter: number
  outlineWidth: number
  cornerRadius: number
  strokeWidth: number
  innerDotDiameter: number
}>

/**
 * Intrinsic local Socket geometry calibrated to Blender's `NODE_SOCKSIZE`.
 *
 * Blender uses a radius of one quarter widget unit, so the ordinary Socket
 * diameter is one half unit. These metrics remain local scene geometry: the
 * retained Node parent scales them continuously and no screen-space floor is
 * applied here.
 */
export const BLENDER_SOCKET_VISUAL_POLICY: BlenderSocketVisualPolicy = Object.freeze({
  diameter: 10,
  outlineWidth: 1,
  cornerRadius: 1,
  strokeWidth: 2,
  innerDotDiameter: 3,
})

const NODE_HEADER_HEIGHT = 24
const BLENDER_NODE_RADIUS = 6

/**
 * Intrinsic Node shadow mapped from Blender's `node_draw_shadow` law.
 *
 * Blender uses `shadow_width = 0.6 × widget_unit` and alpha `0.5`. MetaFor's
 * local widget rhythm is 20, so the complete soft fade is 12 local units.
 * Blender does not define a separate solid spread for this shadow, therefore
 * the analytical SDF keeps spread at zero. The retained Node parent scales the
 * same local values continuously; there is no fixture offset or screen floor.
 */
const BLENDER_NODE_SHADOW_VISUAL_POLICY = Object.freeze({
  blur: 0.6 * 20,
  spread: 0,
  opacity: 0.5,
})
const BLENDER_NODE_HEADER_VISUAL_POLICY = Object.freeze({
  leftPadding: 8,
  rightPadding: 6,
  iconSlotWidth: 12,
  iconGap: 4,
  chevronEnvelope: 8,
  chevronDepth: 5,
  chevronStrokeWidth: 1.5,
  chevronOpticalInset: chevronMiterOpticalInset(8, 5, 1.5),
})
const NODE_PADDING = 8
const NODE_GAP = 3
/** Minimum of Blender's default `node_type_size_preset` in `blenkernel/intern/node.cc`. */
const NODE_MIN_WIDTH = 100
const NODE_MIN_HEIGHT = 52
const NODE_FONT_PX = 11
const NODE_FONT_LETTER_SPACING = NODE_FONT_PX * 0.05
const NODE_FONT_GLYPH_ADVANCE = NODE_FONT_PX * 0.6
const NODE_FONT_SPACE_ADVANCE = NODE_FONT_PX * 0.3
const EMPTY_CONNECTED_SOCKET_IDS: ReadonlySet<string> = new Set()

export function blenderSocketPreset(kind: BlenderSocketKind): BlenderSocketPreset {
  return BLENDER_SOCKET_PRESETS[kind]
}

export function measureBlenderNode(
  node: BlenderNode,
  connectedSocketIds: ReadonlySet<string> = EMPTY_CONNECTED_SOCKET_IDS,
): Readonly<{width: number; height: number}> {
  const width = measureBlenderNodeWidth(node)
  if (node.collapsed) {
    const sockets = node.sockets ?? []
    const maxSideCount = Math.max(
      sockets.filter((socket) => socketSide(socket) === "left").length,
      sockets.filter((socket) => socketSide(socket) === "right").length,
    )
    return {width, height: Math.max(NODE_HEADER_HEIGHT, maxSideCount * 8 + 10)}
  }
  const rows = blenderNodeRows(node, connectedSocketIds)
  const rowsHeight = rows.reduce((height, row) => height + rowHeight(row), 0)
    + Math.max(0, rows.length - 1) * NODE_GAP
  return {
    width,
    height: Math.max(NODE_MIN_HEIGHT, NODE_HEADER_HEIGHT + NODE_PADDING * 2 + rowsHeight),
  }
}

/**
 * Plans the initial Node width from the same content later materialized by the
 * renderer. Blender provides a 100-unit lower bound and arbitrary UI layout
 * scaling rather than semantic width tiers. MetaFor therefore keeps that
 * source minimum, then expands it for the project font, Socket/property labels
 * and shared Field intrinsic widths. Explicit positioned widths remain owned
 * by `positionBlenderNode` / `planBlenderNode` and never pass through here.
 */
function measureBlenderNodeWidth(node: BlenderNode): number {
  const headerWidth = BLENDER_NODE_HEADER_VISUAL_POLICY.leftPadding
    + BLENDER_NODE_HEADER_VISUAL_POLICY.iconSlotWidth
    + BLENDER_NODE_HEADER_VISUAL_POLICY.iconGap
    + measureNodeTextWidth(node.label ?? node.title)
    + BLENDER_NODE_HEADER_VISUAL_POLICY.rightPadding
  if (node.collapsed) return Math.ceil(Math.max(NODE_MIN_WIDTH, headerWidth))
  let contentWidth = 0
  for (const field of node.properties ?? []) {
    contentWidth = Math.max(contentWidth, measureFieldContentWidth(field, field.label))
  }
  for (const parameter of node.parameters ?? []) {
    const sockets = (node.sockets ?? []).filter((socket) => socket.parameterId === parameter.id)
    const side = sockets.length === 0 ? undefined : parameterLabelSide(sockets)
    const label = side === undefined ? parameter.label : socketPropertyLabel(parameter.label, side)
    contentWidth = Math.max(contentWidth, measureFieldContentWidth(parameter.field, label))
  }
  for (const socket of node.sockets ?? []) {
    if (socket.parameterId !== undefined) continue
    contentWidth = Math.max(contentWidth, measureNodeTextWidth(socket.label))
  }
  return Math.ceil(Math.max(
    NODE_MIN_WIDTH,
    headerWidth,
    contentWidth + NODE_PADDING * 2,
  ))
}

function measureFieldContentWidth(field: FieldDefinition | undefined, label: string): number {
  const intrinsicWidth = field === undefined
    ? 0
    : measureFieldLayout(field, {density: "compact"}).intrinsicWidth ?? 0
  return Math.max(intrinsicWidth, measureNodeTextWidth(label))
}

/** Mirrors the project font defaults used by `UiSurface.measureText`. */
function measureNodeTextWidth(value: string): number {
  let width = 0
  for (const character of value) {
    width += character === " "
      ? NODE_FONT_SPACE_ADVANCE
      : NODE_FONT_GLYPH_ADVANCE + NODE_FONT_LETTER_SPACING
  }
  return width
}

/** Plans Standard Node child slots and exact Socket anchors through shared Flex. */
export function planBlenderNode(
  node: BlenderNode,
  frame: NodeRect,
  connectedSocketIds: ReadonlySet<string> = EMPTY_CONNECTED_SOCKET_IDS,
): BlenderNodePlan {
  if (node.collapsed) return planCollapsedBlenderNode(node, frame)
  const measurement = measureBlenderNode(node, connectedSocketIds)
  const rect = {...frame, h: measurement.height}
  const regions = blenderNodeRegions(rect)
  const fields: Array<{
    field: FieldDefinition
    rect: NodeRect
    editorRect: NodeRect
    parameterId?: string
    editorVisible: boolean
    separateLabel: boolean
  }> = []
  const parameters: Array<{
    parameter: BlenderParameter
    rect: NodeRect
    side?: SocketSide
    separateLabel: boolean
  }> = []
  const sockets: PositionedSocket<BlenderSocket>[] = []
  const rows = blenderNodeRows(node, connectedSocketIds)
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
        const layout = row.field === undefined ? null : measureFieldLayout(row.field, {density: "compact"})
        const intrinsicWidth = layout?.intrinsicWidth ?? w
        const fieldWidth = Math.min(w, intrinsicWidth)
        const fieldRect = {x: x + (w - fieldWidth) / 2, y, w: fieldWidth, h}
        const labelRect = layout !== null && layout.labelRowHeight > 0
          ? {x: fieldRect.x, y: fieldRect.y, w: fieldRect.w, h: layout.labelRowHeight}
          : fieldRect
        const editorVisible = row.editorVisible
        const separateLabel = row.parameter !== undefined && row.sockets.length > 0 && layout !== null && layout.labelRowHeight > 0
        const editorRect = separateLabel && layout !== null
          ? {
              x: fieldRect.x,
              y: fieldRect.y + layout.controlOffsetY,
              w: fieldRect.w,
              h: editorVisible ? layout.controlHeight : 0,
            }
          : fieldRect
        if (row.field !== undefined) fields.push({
          field: row.field,
          rect: fieldRect,
          editorRect,
          editorVisible,
          separateLabel,
          ...(row.parameter === undefined ? {} : {parameterId: row.parameter.id}),
        })
        if (row.parameter !== undefined) parameters.push({
          parameter: row.parameter,
          rect: labelRect,
          separateLabel,
          ...(row.sockets.length === 0 ? {} : {side: parameterLabelSide(row.sockets)}),
        })
        for (const socket of row.sockets) sockets.push({
          socket,
          side: socketSide(socket),
          center: socketCenter(rect, labelRect, socket),
        })
      },
    })),
  })
  return {rect, header: regions.header, body: regions.body, fields, parameters, sockets}
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
  return {rect: frame, header: frame, body: {...frame, h: 0}, fields: [], parameters: [], sockets}
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
  plan({entry, connectedSocketIds}) {
    return planBlenderNode(entry.node, entry.rect, connectedSocketIds)
  },
  presentation({entry}, plan) {
    return {...entry, rect: plan.rect, sockets: plan.sockets}
  },
  render({host, entry, selected, plan}) {
    const {node} = entry
    const rect = plan.rect
    const header = nodeHeaderColor(node)
    host.drawRoundedShadow(rect.x, rect.y, rect.w, rect.h, {
      radius: BLENDER_NODE_RADIUS,
      blur: BLENDER_NODE_SHADOW_VISUAL_POLICY.blur,
      spread: BLENDER_NODE_SHADOW_VISUAL_POLICY.spread,
      color: selected ? header : new Color(0, 0, 0, 1),
      opacity: BLENDER_NODE_SHADOW_VISUAL_POLICY.opacity,
      z: Z.ELEMENT - 0.02,
    })
    host.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: BLENDER_NODE_RADIUS,
      fill: new Color(0.188, 0.188, 0.188, 1),
      border: new Color(0.075, 0.075, 0.075, 1),
      borderWidth: 1,
      z: Z.ELEMENT,
    })
    host.drawRoundedRect(plan.header.x, plan.header.y, plan.header.w, plan.header.h, {
      radius: BLENDER_NODE_RADIUS,
      fill: fade(header, 0.82),
      border: null,
      z: Z.ELEMENT + 0.01,
    })
    flexRow({
      x: plan.header.x,
      y: plan.header.y,
      w: plan.header.w,
      h: plan.header.h,
      paddingLeft: BLENDER_NODE_HEADER_VISUAL_POLICY.leftPadding,
      paddingRight: BLENDER_NODE_HEADER_VISUAL_POLICY.rightPadding,
      gap: BLENDER_NODE_HEADER_VISUAL_POLICY.iconGap,
      alignItems: "stretch",
      items: [
        {
          width: BLENDER_NODE_HEADER_VISUAL_POLICY.iconSlotWidth,
          height: plan.header.h,
          draw: (slotX, slotY, slotW, slotH) => drawNodeCollapseChevron(
            host,
            slotX,
            slotY,
            slotW,
            slotH,
            node.collapsed === true,
          ),
        },
        {width: "grow", height: plan.header.h, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: node.label ?? node.title,
          fontPx: 11,
          color: selected ? "orange" : "text",
        })},
      ],
    })
    const hiddenParameterIds = new Set(plan.fields.flatMap(({parameterId, editorVisible}) =>
      parameterId !== undefined && !editorVisible ? [parameterId] : []))
    if (!node.collapsed) {
      for (const {field, rect, editorRect, editorVisible, separateLabel} of plan.fields) {
        if (!editorVisible) continue
        const slot = separateLabel ? editorRect : rect
        Field(host, slot.x, slot.y, slot.w, {
          ...field,
          key: `${node.id}:${field.id}`,
          ...(separateLabel ? {compactLabel: "hidden" as const} : {}),
        }, {density: "compact"})
      }
      for (const {parameter, rect: slot, side, separateLabel} of plan.parameters) {
        if (parameter.field !== undefined && !separateLabel && !hiddenParameterIds.has(parameter.id)) continue
        Typography(host, slot.x, slot.y, slot.w, slot.h, {
          children: side === undefined ? parameter.label : socketPropertyLabel(parameter.label, side),
          fontPx: 11,
          sx: {textAlign: side ?? "center"},
        })
      }
    }
    for (const positioned of plan.sockets) {
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

type BlenderNodeRowBase = Readonly<{
  field?: FieldDefinition
  parameter?: BlenderParameter
  sockets: readonly BlenderSocket[]
}>

type BlenderNodeRow = BlenderNodeRowBase & Readonly<{editorVisible: boolean}>

function blenderNodeRows(
  node: BlenderNode,
  connectedSocketIds: ReadonlySet<string> = EMPTY_CONNECTED_SOCKET_IDS,
): readonly BlenderNodeRow[] {
  const rows: BlenderNodeRowBase[] = []
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
  return rows.map((row) => ({
    ...row,
    editorVisible: rowFieldEditorVisible(row, connectedSocketIds),
  }))
}

function rowHeight(row: BlenderNodeRow): number {
  if (row.field === undefined) return 22
  const layout = measureFieldLayout(row.field, {density: "compact"})
  return row.editorVisible ? layout.height : Math.max(22, layout.labelRowHeight)
}

function rowFieldEditorVisible(
  row: BlenderNodeRowBase,
  connectedSocketIds: ReadonlySet<string>,
): boolean {
  if (row.field === undefined || row.parameter === undefined || row.sockets.length === 0) return true
  return row.sockets.some((socket) =>
    socket.hideValue !== true
    && (socket.direction === "output" || !connectedSocketIds.has(socket.id)))
}

function parameterLabelSide(sockets: readonly BlenderSocket[]): SocketSide {
  return sockets.every((socket) => socketSide(socket) === "right") ? "right" : "left"
}

function socketPropertyLabel(label: string, side: SocketSide): string {
  const value = label.trimEnd()
  if (side === "right") return value.endsWith(":") ? value.slice(0, -1).trimEnd() : value
  return value.endsWith(":") ? value : `${value}:`
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

/**
 * Intrinsic open chevron calibrated against Blender's shared Node header rhythm.
 *
 * Blender starts the icon button at `0.4 × widget_unit` and the title at
 * `1.2 × widget_unit`. The retained Node keeps one local square envelope and
 * rotates the same path between down/right states. One intrinsic compensation
 * cancels the polyline miter's directional extension, so the painted bounds
 * stay centered with the title regardless of font baseline or viewport scale.
 */
function drawNodeCollapseChevron(
  host: SocketRendererContext<BlenderSocket>["host"],
  slotX: number,
  slotY: number,
  slotW: number,
  slotH: number,
  collapsed: boolean,
): void {
  const centerX = slotX + slotW / 2
    - (collapsed ? BLENDER_NODE_HEADER_VISUAL_POLICY.chevronOpticalInset : 0)
  const centerY = slotY + slotH / 2
    - (collapsed ? 0 : BLENDER_NODE_HEADER_VISUAL_POLICY.chevronOpticalInset)
  const halfEnvelope = BLENDER_NODE_HEADER_VISUAL_POLICY.chevronEnvelope / 2
  const halfDepth = BLENDER_NODE_HEADER_VISUAL_POLICY.chevronDepth / 2
  const points = collapsed ? [
    {x: centerX - halfDepth, y: centerY - halfEnvelope},
    {x: centerX + halfDepth, y: centerY},
    {x: centerX - halfDepth, y: centerY + halfEnvelope},
  ] : [
    {x: centerX - halfEnvelope, y: centerY - halfDepth},
    {x: centerX, y: centerY + halfDepth},
    {x: centerX + halfEnvelope, y: centerY - halfDepth},
  ]
  host.drawPolyline(
    points,
    palette.text,
    BLENDER_NODE_HEADER_VISUAL_POLICY.chevronStrokeWidth,
    Z.TEXT + 0.03,
  )
}

function chevronMiterOpticalInset(envelope: number, depth: number, strokeWidth: number): number {
  const armRun = envelope / 2
  const armRunUnit = armRun / Math.hypot(armRun, depth)
  return strokeWidth / 4 * (1 / armRunUnit - armRunUnit)
}

function drawSocketShape(
  host: SocketRendererContext<BlenderSocket>["host"],
  cx: number,
  cy: number,
  shape: BlenderSocketShape,
  color: Color,
  selected: boolean,
): void {
  const bounds = blenderSocketVisualBounds({x: cx, y: cy})
  const radius = BLENDER_SOCKET_VISUAL_POLICY.diameter / 2
  const diamondHalfExtent = radius - BLENDER_SOCKET_VISUAL_POLICY.strokeWidth / Math.SQRT2
  if (shape === "line") {
    host.drawLine(
      cx,
      cy - radius,
      cx,
      cy + radius,
      color,
      BLENDER_SOCKET_VISUAL_POLICY.strokeWidth,
      Z.TEXT + 0.03,
    )
    return
  }
  if (shape === "volume-grid") {
    host.drawRoundedRect(bounds.x, bounds.y, bounds.w, bounds.h, {
      radius: BLENDER_SOCKET_VISUAL_POLICY.cornerRadius,
      fill: color,
      border: selected ? palette.windowActiveBorder : palette.bg,
      borderWidth: BLENDER_SOCKET_VISUAL_POLICY.outlineWidth,
      z: Z.TEXT + 0.03,
    })
    const gridHalfExtent = BLENDER_SOCKET_VISUAL_POLICY.diameter / 2 - BLENDER_SOCKET_VISUAL_POLICY.outlineWidth
    host.drawLine(cx, cy - gridHalfExtent, cx, cy + gridHalfExtent, palette.bg, BLENDER_SOCKET_VISUAL_POLICY.outlineWidth, Z.TEXT + 0.04)
    host.drawLine(cx - gridHalfExtent, cy, cx + gridHalfExtent, cy, palette.bg, BLENDER_SOCKET_VISUAL_POLICY.outlineWidth, Z.TEXT + 0.04)
    return
  }
  const baseShape = shape.replace("-dot", "") as "circle" | "square" | "diamond"
  const border = selected ? palette.windowActiveBorder : palette.bg
  if (baseShape === "circle" || baseShape === "square") {
    host.drawRoundedRect(bounds.x, bounds.y, bounds.w, bounds.h, {
      radius: baseShape === "circle"
        ? BLENDER_SOCKET_VISUAL_POLICY.diameter / 2
        : BLENDER_SOCKET_VISUAL_POLICY.cornerRadius,
      fill: color,
      border,
      borderWidth: BLENDER_SOCKET_VISUAL_POLICY.outlineWidth,
      z: Z.TEXT + 0.03,
    })
  } else {
    host.drawPolyline([
      {x: cx, y: cy - diamondHalfExtent},
      {x: cx + diamondHalfExtent, y: cy},
      {x: cx, y: cy + diamondHalfExtent},
      {x: cx - diamondHalfExtent, y: cy},
      {x: cx, y: cy - diamondHalfExtent},
    ], color, BLENDER_SOCKET_VISUAL_POLICY.strokeWidth, Z.TEXT + 0.03)
  }
  if (shape.endsWith("-dot")) {
    const dot = BLENDER_SOCKET_VISUAL_POLICY.innerDotDiameter
    host.drawRoundedRect(cx - dot / 2, cy - dot / 2, dot, dot, {
      radius: dot / 2,
      fill: palette.bg,
      border: null,
      z: Z.TEXT + 0.04,
    })
  }
}

/** Visual-only bounds; interaction hit targets remain a separate policy. */
export function blenderSocketVisualBounds(center: Readonly<{x: number; y: number}>): NodeRect {
  const radius = BLENDER_SOCKET_VISUAL_POLICY.diameter / 2
  return {
    x: center.x - radius,
    y: center.y - radius,
    w: BLENDER_SOCKET_VISUAL_POLICY.diameter,
    h: BLENDER_SOCKET_VISUAL_POLICY.diameter,
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
