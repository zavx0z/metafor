import type {FieldDefinition} from "@ui/components"
import {
  BLENDER_SOCKET_KINDS,
  measureBlenderNode,
  positionBlenderNode,
  type BlenderFrame,
  type BlenderLink,
  type BlenderNode,
  type BlenderParameter,
  type BlenderSocket,
  type BlenderSocketKind,
} from "@nodes/ui/blender-node"
import type {PositionedNode, PositionedNodeTree} from "@nodes/ui/node-editor"

export const SOCKET_CATALOG = BLENDER_SOCKET_KINDS.map((kind, index): BlenderSocket => ({
  id: `catalog-${kind}`,
  label: kind,
  direction: index % 3 === 0 ? "output" : index % 3 === 1 ? "input" : "bidirectional",
  socketType: kind,
}))

/** One representative live Node used only for same-scale Blender comparison. */
export function createNoiseComparisonTree(): PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> {
  const noise = blenderNode("comparison-noise", "Noise Texture", "Texture", [
    {id: "dimensions", label: "Dimensions", compactLabel: "hidden", kind: "enum", value: "3d", options: [
      {value: "1d", label: "1D"},
      {value: "2d", label: "2D"},
      {value: "3d", label: "3D"},
      {value: "4d", label: "4D"},
    ]},
    {id: "noise-type", label: "Noise", compactLabel: "hidden", kind: "enum", value: "fbm", options: [
      {value: "fbm", label: "fBM"},
      {value: "multifractal", label: "Multifractal"},
      {value: "hybrid", label: "Hybrid Multifractal"},
    ]},
    {id: "normalize", label: "Normalize", kind: "boolean", value: true},
  ], [
    {id: "vector-value", label: "Vector"},
    parameter({id: "scale", label: "Scale", kind: "number", presentation: "slider", value: 5, min: 0, max: 10, step: 0.1}),
    parameter({id: "detail", label: "Detail", kind: "number", presentation: "slider", value: 2, min: 0, max: 15, step: 0.1}),
    parameter({id: "roughness", label: "Roughness", kind: "number", presentation: "slider", value: 0.5, min: 0, max: 1, step: 0.01}),
    parameter({id: "lacunarity", label: "Lacunarity", kind: "number", presentation: "slider", value: 2, min: 0, max: 4, step: 0.1}),
    parameter({id: "distortion", label: "Distortion", kind: "number", presentation: "slider", value: 0, min: 0, max: 10, step: 0.1}),
  ], [
    socket("vector", "Vector", "input", "vector", "vector-value", "left"),
    socket("scale", "Scale", "input", "float", "scale", "left"),
    socket("detail", "Detail", "input", "float", "detail", "left"),
    socket("roughness", "Roughness", "input", "float", "roughness", "left"),
    socket("lacunarity", "Lacunarity", "input", "float", "lacunarity", "left"),
    socket("distortion", "Distortion", "input", "float", "distortion", "left"),
    socket("fac", "Fac", "output", "float"),
    socket("color", "Color", "output", "color"),
  ], false)
  const nodes: PositionedNode<BlenderNode, BlenderSocket>[] = [positionCatalogNode(noise, 120, 34, 260)]
  return {
    bounds: {x: 0, y: 0, w: 500, h: 350},
    frames: [],
    nodes,
    links: [],
  }
}

export function createCatalogNodeTree(
  options: Readonly<{
    openSelect?: boolean
    translationLinked?: boolean
    rotationLinked?: boolean
    rotationOutput?: boolean
    colorLinked?: boolean
    previewEnabled?: boolean
    previewNodeIds?: readonly string[]
    previewEnabledByNode?: Readonly<Record<string, boolean>>
    previewBuffer?: "primary" | "alternate" | "missing" | "zero"
    onPreviewToggle?(nodeId: string, enabled: boolean): void
  }> = {},
): PositionedNodeTree<BlenderNode, BlenderSocket, BlenderLink, BlenderFrame> {
  const frame: BlenderFrame = {id: "catalog-frame", label: "Система компонентов нод"}
  const nestedFrame: BlenderFrame = {
    id: "data-frame",
    parentFrameId: "catalog-frame",
    label: "Обработка данных",
    color: {r: 0.16, g: 0.28, b: 0.48, a: 1},
    labelSize: 15,
  }
  const scalar = blenderNode("scalar", "Скалярная математика", "Converter", [
    {
      id: "operation",
      label: "Операция",
      kind: "enum",
      value: "multiply",
      ...(options.openSelect === true ? {open: true} : {}),
      options: [
        {value: "add", label: "Сложение"},
        {value: "multiply", label: "Умножение"},
      ],
    },
  ], [
    parameter({id: "factor", label: "Коэффициент", kind: "number", presentation: "slider", value: 0.65, min: 0, max: 1, step: 0.01}),
    parameter({id: "iterations", label: "Iterations", kind: "integer", value: 3, min: 0, max: 100}),
    parameter({id: "clamp", label: "Ограничение", kind: "boolean", value: true}),
  ], [
    socket("value", "Коэффициент", "input", "float", "factor", "left"),
    socket("iterations", "Iterations", "input", "integer", "iterations", "left"),
    socket("enabled", "Ограничение", "input", "boolean", "clamp", "left"),
    socket("result", "Результат", "output", "float"),
  ])
  const transform = blenderNode("transform", "Преобразование", "Vector", [], [
    parameter({id: "translation", label: "Перемещение", kind: "vector", value: [1, 2, 3]}),
    parameter({id: "rotation", label: "Вращение", kind: "rotation", value: [0, 45, 90]}),
  ], [
    socket("vector", "Перемещение", "input", "vector", "translation", "left"),
    socket(
      "rotation",
      "Вращение",
      options.rotationOutput === true ? "output" : "input",
      "rotation",
      "rotation",
      options.rotationOutput === true ? "right" : "left",
    ),
    socket("matrix", "Матрица", "output", "matrix"),
  ])
  const shader = blenderNode("shader", "Principled", "Shader", [
    {id: "distribution", label: "Распределение", kind: "enum", value: "ggx", options: [
      {value: "ggx", label: "GGX"},
      {value: "multi", label: "Multiscatter"},
    ]},
  ], [
    parameter({id: "base-color", label: "Основной цвет", kind: "color", value: {r: 0.15, g: 0.42, b: 0.88, a: 1}}),
    parameter({id: "material-value", label: "Материал", kind: "reference", value: {id: "material-1", label: "Material.001", kind: "material"}}),
  ], [
    socket("color", "Основной цвет", "input", "color", "base-color", "left"),
    socket("material", "Материал", "input", "material", "material-value", "left"),
    socket("shader", "Шейдер", "output", "shader"),
  ])
  const previewNodeIds = options.previewNodeIds ?? (
    options.previewEnabled === undefined && options.onPreviewToggle === undefined ? [] : ["scalar"]
  )
  const previewableScalar = previewNodeIds.includes("scalar")
    ? withNodePreview(
        scalar,
        options.previewEnabledByNode?.scalar ?? options.previewEnabled === true,
        options.previewBuffer,
        options.onPreviewToggle,
      )
    : scalar
  const previewableShader = previewNodeIds.includes("shader")
    ? withNodePreview(
        shader,
        options.previewEnabledByNode?.shader ?? true,
        options.previewBuffer,
        options.onPreviewToggle,
      )
    : shader
  const asset = blenderNode("asset", "Ввод ресурса", "Resource", [
    {id: "name", label: "Имя", kind: "text", value: "Suzanne"},
    {id: "object", label: "Объект", kind: "reference", value: {id: "suzanne", label: "Suzanne", kind: "object"}},
    {id: "path", label: "Путь", kind: "path", value: "/textures/suzanne.png"},
  ], [
    parameter({
      id: "resources",
      label: "Ресурсы",
      kind: "collection",
      items: [
        {id: "suzanne", label: "Suzanne"},
        {id: "cube", label: "Cube"},
      ],
      selectedId: "suzanne",
      visibleRows: 2,
    }),
  ], [
    socket("object", "Объект", "output", "object"),
    socket("image", "Изображение", "output", "image"),
    socket("string", "Имя", "output", "string"),
  ])
  const matrix = blenderNode("matrix", "Матричная математика", "Utility", [
    {id: "status", label: "Статус", kind: "readonly", value: "Единичная"},
  ], [
    parameter({id: "matrix-value", label: "Матрица", kind: "matrix", value: [[1, 0], [0, 1]]}),
  ], [
    socket("matrix-in", "Матрица", "input", "matrix", "matrix-value", "left"),
    socket("matrix-out", "Матрица", "output", "matrix", "matrix-value", "right"),
    socket("geometry", "Геометрия", "input", "geometry"),
    socket("bundle", "Bundle", "bidirectional", "bundle"),
    socket("closure", "Closure", "output", "closure"),
  ])
  const collapsed: BlenderNode = {
    ...blenderNode("collapsed", "Компактное смешивание", "Converter", [], [], [
      socket("factor-a", "A", "input", "float"),
      socket("factor-b", "B", "input", "float"),
      socket("mixed", "Результат", "output", "float"),
    ]),
    collapsed: true,
  }

  const nodes: PositionedNode<BlenderNode, BlenderSocket>[] = [
    positionCatalogNode(previewableScalar, 40, 70, 260),
    positionCatalogNode(transform, 340, 60),
    positionCatalogNode(previewableShader, 720, 65, 330),
    positionCatalogNode(asset, 130, 360, 300),
    positionCatalogNode(collapsed, 450, 420, 120),
    positionCatalogNode(matrix, 590, 350, 390),
  ]

  const links = [
    link("scalar-transform", "scalar", "result", "transform", "vector", "float", nodes),
    link("transform-shader", "transform", "matrix", "shader", "color", "matrix", nodes),
    link("asset-matrix", "asset", "object", "matrix", "matrix-in", "object", nodes),
    link("matrix-shader", "matrix", "closure", "shader", "material", "closure", nodes, "right-loop"),
  ]
  if (options.translationLinked === false) {
    const index = links.findIndex(({link}) => link.id === "scalar-transform")
    if (index >= 0) links.splice(index, 1)
  }
  if (options.colorLinked === false) {
    const index = links.findIndex(({link}) => link.id === "transform-shader")
    if (index >= 0) links.splice(index, 1)
  }
  if (options.rotationLinked === true) {
    links.push(link("scalar-transform-rotation", "scalar", "result", "transform", "rotation", "rotation", nodes))
  }

  const dataFrameRect = {
    x: 80,
    y: 320,
    w: 950,
    h: frameHeightForNodes(nodes, "data-frame", 320, 300),
  }
  const catalogHeight = Math.max(650, dataFrameRect.y + dataFrameRect.h + 30)

  return {
    bounds: {x: 0, y: 0, w: 1120, h: catalogHeight},
    frames: [
      {frame, rect: {x: 0, y: 0, w: 1120, h: catalogHeight}},
      {frame: nestedFrame, rect: dataFrameRect},
    ],
    nodes,
    links,
  }
}

function withNodePreview(
  node: BlenderNode,
  enabled: boolean,
  buffer: "primary" | "alternate" | "missing" | "zero" | undefined,
  onToggle: ((nodeId: string, enabled: boolean) => void) | undefined,
): BlenderNode {
  return {
    ...node,
    preview: {
      enabled,
      ...(buffer === "missing" ? {} : {
        image: {
          src: nodePreviewImage(buffer === "alternate" ? "alternate" : "primary"),
          width: buffer === "zero" ? 0 : 320,
          height: 90,
        },
      }),
      ...(onToggle === undefined ? {} : {onToggle: (next) => onToggle(node.id, next)}),
    },
  }
}

function nodePreviewImage(variant: "primary" | "alternate"): string {
  const colors = variant === "primary"
    ? ["#16243d", "#4772b3", "#e6e6e6"]
    : ["#381d22", "#b34b62", "#f0d7a1"]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="320" height="90" fill="url(#g)"/><circle cx="80" cy="45" r="28" fill="${colors[2]}" fill-opacity=".82"/><path d="M130 65 175 22l38 31 32-25 50 37Z" fill="${colors[2]}" fill-opacity=".62"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function frameHeightForNodes(
  nodes: readonly PositionedNode<BlenderNode, BlenderSocket>[],
  frameId: string,
  y: number,
  minimum: number,
): number {
  const bottom = Math.max(y, ...nodes
    .filter(({node}) => node.frameId === frameId)
    .map(({rect}) => rect.y + rect.h))
  return Math.max(minimum, bottom - y + 30)
}

function positionCatalogNode(
  node: BlenderNode,
  x: number,
  y: number,
  width?: number,
): PositionedNode<BlenderNode, BlenderSocket> {
  const measurement = measureBlenderNode(node)
  return positionBlenderNode(node, {x, y, w: width ?? measurement.width, h: measurement.height})
}

function blenderNode(
  id: string,
  title: string,
  category: string,
  properties: readonly FieldDefinition[],
  parameters: readonly BlenderParameter[],
  sockets: readonly BlenderSocket[],
  attachToCatalogFrame = true,
): BlenderNode {
  return {
    id,
    ...(attachToCatalogFrame ? {
      frameId: id === "asset" || id === "matrix" || id === "collapsed" ? "data-frame" : "catalog-frame",
    } : {}),
    title,
    category,
    headerColor: categoryHeaderColor(category),
    properties,
    parameters,
    sockets,
  }
}

function categoryHeaderColor(category: string): Readonly<{r: number; g: number; b: number; a: number}> {
  if (category === "Converter") return {r: 0.36, g: 0.28, b: 0.55, a: 1}
  if (category === "Vector") return {r: 0.24, g: 0.32, b: 0.58, a: 1}
  if (category === "Shader") return {r: 0.20, g: 0.47, b: 0.22, a: 1}
  if (category === "Resource") return {r: 0.55, g: 0.25, b: 0.20, a: 1}
  if (category === "Texture") return {r: 0.55, g: 0.27, b: 0.08, a: 1}
  return {r: 0.18, g: 0.45, b: 0.48, a: 1}
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
