import type {FieldDefinition} from "@ui/components"
import {
  BLENDER_SOCKET_KINDS,
  positionBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderParameter,
  type BlenderSocket,
  type BlenderSocketKind,
} from "../blender-node.ts"
import type {PositionedNode, PositionedNodeTree} from "../node-editor.ts"

export const STANDALONE_FIELD_KINDS = Object.freeze([
  "text",
  "number",
  "boolean",
  "enum",
  "color",
  "vector",
  "rotation",
  "matrix",
  "reference",
  "readonly",
] as const)

export function createStandaloneFields(
  update: (id: string, value: unknown) => void,
  activateReference: () => void,
): readonly FieldDefinition[] {
  return [
    {id: "text", label: "Text", kind: "text", value: "Blender Node", onChange: (value) => update("text", value)},
    {id: "number", label: "Float", kind: "number", value: 0.625, step: 0.025, onChange: (value) => update("number", value)},
    {id: "slider", label: "Factor", kind: "number", presentation: "slider", value: 0.72, min: 0, max: 1, step: 0.01, onChange: (value) => update("slider", value)},
    {id: "boolean", label: "Clamp", kind: "boolean", value: true, onChange: (value) => update("boolean", value)},
    {id: "enum", label: "Operation", kind: "enum", value: "multiply", options: [
      {value: "add", label: "Add"},
      {value: "multiply", label: "Multiply"},
      {value: "power", label: "Power"},
    ], onChange: (value) => update("enum", value)},
    {id: "color", label: "Color", kind: "color", value: {r: 0.18, g: 0.58, b: 0.92, a: 1}, onChange: (value) => update("color", value)},
    {id: "vector", label: "Vector", kind: "vector", value: [1, 2, 3], onChange: (value) => update("vector", value)},
    {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90], unit: "°", onChange: (value) => update("rotation", value)},
    {id: "matrix", label: "Matrix", kind: "matrix", value: [[1, 0], [0, 1]], onChange: (value) => update("matrix", value)},
    {id: "reference", label: "Material", kind: "reference", value: {id: "material-1", label: "Material.001", kind: "material"}, onActivate: activateReference},
    {id: "readonly", label: "Result", kind: "readonly", value: "Ready"},
  ]
}

export const SOCKET_CATALOG = BLENDER_SOCKET_KINDS.map((kind, index): BlenderSocket => ({
  id: `catalog-${kind}`,
  label: kind,
  direction: index % 3 === 0 ? "output" : index % 3 === 1 ? "input" : "bidirectional",
  socketType: kind,
}))

export function createCatalogNodeTree(): PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> {
  const frame: BlenderFrame = {id: "catalog-frame", label: "Node component system"}
  const scalar = blenderNode("scalar", "Scalar Math", "Converter", [
    {id: "operation", label: "Operation", kind: "enum", value: "multiply", options: [
      {value: "add", label: "Add"},
      {value: "multiply", label: "Multiply"},
    ]},
  ], [
    parameter({id: "factor", label: "Factor", kind: "number", presentation: "slider", value: 0.65, min: 0, max: 1, step: 0.01}),
    parameter({id: "clamp", label: "Clamp", kind: "boolean", value: true}),
  ], [
    socket("value", "Factor", "input", "float", "factor", "left"),
    socket("enabled", "Clamp", "input", "boolean", "clamp", "left"),
    socket("result", "Result", "output", "float"),
  ])
  const transform = blenderNode("transform", "Transform", "Vector", [], [
    parameter({id: "translation", label: "Translation", kind: "vector", value: [1, 2, 3]}),
    parameter({id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90]}),
  ], [
    socket("vector", "Translation", "input", "vector", "translation", "left"),
    socket("rotation", "Rotation", "input", "rotation", "rotation", "left"),
    socket("matrix", "Matrix", "output", "matrix"),
  ])
  const shader = blenderNode("shader", "Principled", "Shader", [
    {id: "distribution", label: "Distribution", kind: "enum", value: "ggx", options: [
      {value: "ggx", label: "GGX"},
      {value: "multi", label: "Multiscatter"},
    ]},
  ], [
    parameter({id: "base-color", label: "Base Color", kind: "color", value: {r: 0.15, g: 0.42, b: 0.88, a: 1}}),
    parameter({id: "material-value", label: "Material", kind: "reference", value: {id: "material-1", label: "Material.001", kind: "material"}}),
  ], [
    socket("color", "Base Color", "input", "color", "base-color", "left"),
    socket("material", "Material", "input", "material", "material-value", "left"),
    socket("shader", "Shader", "output", "shader"),
  ])
  const asset = blenderNode("asset", "Asset Input", "Resource", [
    {id: "name", label: "Name", kind: "text", value: "Suzanne"},
    {id: "object", label: "Object", kind: "reference", value: {id: "suzanne", label: "Suzanne", kind: "object"}},
  ], [], [
    socket("object", "Object", "output", "object"),
    socket("image", "Image", "output", "image"),
    socket("string", "Name", "output", "string"),
  ])
  const matrix = blenderNode("matrix", "Matrix Math", "Utility", [
    {id: "status", label: "Status", kind: "readonly", value: "Identity"},
  ], [
    parameter({id: "matrix-value", label: "Matrix", kind: "matrix", value: [[1, 0], [0, 1]]}),
  ], [
    socket("matrix-in", "Matrix", "input", "matrix", "matrix-value", "left"),
    socket("matrix-out", "Matrix", "output", "matrix", "matrix-value", "right"),
    socket("geometry", "Geometry", "input", "geometry"),
    socket("bundle", "Bundle", "bidirectional", "bundle"),
    socket("closure", "Closure", "output", "closure"),
  ])

  const nodes: PositionedNode<BlenderNode, BlenderSocket>[] = [
    positionBlenderNode(scalar, {x: 40, y: 70, w: 260, h: 250}),
    positionBlenderNode(transform, {x: 340, y: 60, w: 310, h: 240}),
    positionBlenderNode(shader, {x: 720, y: 65, w: 330, h: 250}),
    positionBlenderNode(asset, {x: 130, y: 360, w: 300, h: 260}),
    positionBlenderNode(matrix, {x: 590, y: 350, w: 390, h: 280}),
  ]

  return {
    bounds: {x: 0, y: 0, w: 1120, h: 650},
    frames: [{frame, rect: {x: 0, y: 0, w: 1120, h: 650}}],
    nodes,
    links: [
      link("scalar-transform", "scalar", "result", "transform", "vector", "float", nodes),
      link("transform-shader", "transform", "matrix", "shader", "color", "matrix", nodes),
      link("asset-matrix", "asset", "object", "matrix", "matrix-in", "object", nodes),
      link("matrix-shader", "matrix", "closure", "shader", "material", "closure", nodes, "right-loop"),
    ],
  }
}

function blenderNode(
  id: string,
  title: string,
  category: string,
  properties: readonly FieldDefinition[],
  parameters: readonly BlenderParameter[],
  sockets: readonly BlenderSocket[],
): BlenderNode {
  return {id, frameId: "catalog-frame", title, category, properties, parameters, sockets}
}

function parameter(field: FieldDefinition): BlenderParameter {
  return {id: field.id, label: field.label, field}
}

function socket(
  id: string,
  label: string,
  direction: BlenderSocket["direction"],
  socketType: BlenderSocket["socketType"],
  parameterId?: string,
  side?: BlenderSocket["side"],
): BlenderSocket {
  return {
    id,
    label,
    direction,
    socketType,
    ...(parameterId === undefined ? {} : {parameterId}),
    ...(side === undefined ? {} : {side}),
  }
}

function link(
  id: string,
  sourceNodeId: string,
  sourceSocketId: string,
  targetNodeId: string,
  targetSocketId: string,
  socketType: BlenderSocketKind,
  nodes: readonly PositionedNode<BlenderNode, BlenderSocket>[],
  route: "direct" | "right-loop" = "direct",
): Readonly<{link: BlenderLink; points: readonly Readonly<{x: number; y: number}>[]}> {
  const from = exactSocketCenter(nodes, sourceNodeId, sourceSocketId)
  const to = exactSocketCenter(nodes, targetNodeId, targetSocketId)
  const axis = route === "right-loop" ? Math.max(from.x, to.x) + 100 : (from.x + to.x) / 2
  return {
    link: {
      id,
      socketType,
      from: {nodeId: sourceNodeId, socketId: sourceSocketId},
      to: {nodeId: targetNodeId, socketId: targetSocketId},
    },
    points: [from, {x: axis, y: from.y}, {x: axis, y: to.y}, to],
  }
}

function exactSocketCenter(
  nodes: readonly PositionedNode<BlenderNode, BlenderSocket>[],
  nodeId: string,
  socketId: string,
): Readonly<{x: number; y: number}> {
  const center = nodes.find(({node}) => node.id === nodeId)?.sockets.find(({socket}) => socket.id === socketId)?.center
  if (center === undefined) throw new Error(`Missing catalog Socket: ${nodeId}/${socketId}`)
  return center
}
