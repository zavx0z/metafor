import {measureFieldLayout, type FieldDefinition} from "@ui/components/field"
import type {NodeRect, PositionedLink, PositionedSocket} from "@nodes/ui/node-editor"
import type {Parameter, ParameterPlan} from "@nodes/ui/parameter"
import type {
  BlenderLink,
  BlenderSocket,
  BlenderSocketKind,
} from "@nodes/ui/blender-node"
import {
  NODE_PARAMETER_FIELD_KINDS,
  NODE_PARAMETER_FIELD_LABELS,
  type NodeParameterFieldKind,
  type NodeParameterVariant,
} from "../parameter-catalog.ts"

export type ParameterStoryFixture = Readonly<{
  kind: NodeParameterFieldKind
  variant: NodeParameterVariant
  nodeId: string
  entry: ParameterPlan
  sockets: readonly PositionedSocket<BlenderSocket>[]
  links: readonly PositionedLink<BlenderLink>[]
}>

const PARAMETER_NODE_ID = "parameter-story"

/** Test-only presentation choice; Field kind does not define Socket semantics. */
const DEMO_SOCKET_KINDS = Object.freeze({
  text: "string",
  number: "float",
  integer: "integer",
  boolean: "boolean",
  enum: "menu",
  color: "color",
  vector: "vector",
  rotation: "rotation",
  matrix: "matrix",
  reference: "object",
  collection: "collection",
  path: "string",
  readonly: "custom",
} satisfies Readonly<Record<NodeParameterFieldKind, BlenderSocketKind>>)

const PARAMETERS_BY_KIND = new Map<NodeParameterFieldKind, Parameter>(
  NODE_PARAMETER_FIELD_KINDS.map((kind) => [kind, Object.freeze({
    id: `${kind}-parameter`,
    label: NODE_PARAMETER_FIELD_LABELS[kind],
    description: `Демонстрационный Parameter для Field ${kind}.`,
    field: fieldDefinition(kind),
  })]),
)

/** Builds one exact Parameter plan while keeping Parameter and Field identity stable per kind. */
export function createParameterStoryFixture(
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
  frame: NodeRect,
): ParameterStoryFixture {
  const parameter = requiredParameter(kind)
  const sockets = parameterSockets(kind, variant, parameter)
  const link = parameterLink(kind, variant, sockets)
  const connectedSocketIds = new Set(link === null ? [] : [
    ...(link.from.nodeId === PARAMETER_NODE_ID ? [link.from.socketId] : []),
    ...(link.to.nodeId === PARAMETER_NODE_ID ? [link.to.socketId] : []),
  ])
  const layout = measureFieldLayout(parameter.field, {density: "compact"})
  const separateLabel = sockets.length > 0 && layout.labelRowHeight > 0
  const editorVisible = sockets.length === 0 || sockets.some((socket) =>
    socket.direction === "output" || !connectedSocketIds.has(socket.id))
  const rect = Object.freeze({
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: editorVisible ? layout.height : Math.max(22, layout.labelRowHeight),
  })
  const labelRect = separateLabel
    ? Object.freeze({...rect, h: Math.max(22, layout.labelRowHeight)})
    : rect
  const editorRect = separateLabel
    ? Object.freeze({
        x: rect.x,
        y: rect.y + layout.controlOffsetY,
        w: rect.w,
        h: editorVisible ? layout.controlHeight : 0,
      })
    : rect
  const positionedSockets = Object.freeze(sockets.map((socket): PositionedSocket<BlenderSocket> => Object.freeze({
    socket,
    side: socket.side ?? (socket.direction === "output" ? "right" : "left"),
    center: Object.freeze({
      x: (socket.side ?? (socket.direction === "output" ? "right" : "left")) === "right"
        ? frame.x + frame.w + 10
        : frame.x - 10,
      y: labelRect.y + labelRect.h / 2,
    }),
  })))
  const side = positionedSockets.length === 0
    ? undefined
    : positionedSockets.every(({side: socketSide}) => socketSide === "right") ? "right" : "left"
  return Object.freeze({
    kind,
    variant,
    nodeId: PARAMETER_NODE_ID,
    entry: Object.freeze({
      parameter,
      rect,
      labelRect,
      editorRect,
      editorVisible,
      separateLabel,
      ...(side === undefined ? {} : {side}),
    }),
    sockets: positionedSockets,
    links: positionedLinks(link, positionedSockets),
  })
}

function requiredParameter(kind: NodeParameterFieldKind): Parameter {
  const parameter = PARAMETERS_BY_KIND.get(kind)
  if (parameter === undefined) throw new Error(`Missing Parameter fixture: ${kind}`)
  return parameter
}

function parameterSockets(
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
  parameter: Parameter,
): readonly BlenderSocket[] {
  if (variant === "field") return Object.freeze([])
  const input: BlenderSocket = Object.freeze({
    id: `${kind}-input`,
    label: parameter.label,
    direction: "input",
    parameterId: parameter.id,
    socketType: DEMO_SOCKET_KINDS[kind],
    side: "left",
  })
  const output: BlenderSocket = Object.freeze({
    id: `${kind}-output`,
    label: parameter.label,
    direction: "output",
    parameterId: parameter.id,
    socketType: DEMO_SOCKET_KINDS[kind],
    side: "right",
  })
  if (variant === "input" || variant === "connected") return Object.freeze([input])
  if (variant === "output") return Object.freeze([output])
  return Object.freeze([input, output])
}

function parameterLink(
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
  sockets: readonly BlenderSocket[],
): BlenderLink | null {
  if (variant !== "connected") return null
  const input = sockets.find(({direction}) => direction === "input")
  if (input === undefined) throw new Error(`Connected Parameter story requires an input Socket: ${kind}`)
  return Object.freeze({
    id: `source-${kind}`,
    from: Object.freeze({nodeId: "source", socketId: `${kind}-source-output`}),
    to: Object.freeze({nodeId: PARAMETER_NODE_ID, socketId: input.id}),
    socketType: DEMO_SOCKET_KINDS[kind],
  })
}

function positionedLinks(
  link: BlenderLink | null,
  sockets: readonly PositionedSocket<BlenderSocket>[],
): readonly PositionedLink<BlenderLink>[] {
  if (link === null) return Object.freeze([])
  const target = sockets.find(({socket}) => socket.id === link.to.socketId)?.center
  if (target === undefined) throw new Error("Connected Parameter story requires an exact target Socket")
  return Object.freeze([Object.freeze({
    link,
    points: Object.freeze([
      Object.freeze({x: target.x - 130, y: target.y - 46}),
      Object.freeze({x: target.x - 72, y: target.y - 46}),
      Object.freeze({x: target.x - 72, y: target.y}),
      target,
    ]),
  })])
}

function fieldDefinition(kind: NodeParameterFieldKind): FieldDefinition {
  const base = {id: `${kind}-field`, label: NODE_PARAMETER_FIELD_LABELS[kind]}
  if (kind === "text") return Object.freeze({...base, kind, value: "MetaFor"})
  if (kind === "number") return Object.freeze({
    ...base,
    kind,
    value: 0.625,
    presentation: "slider",
    min: 0,
    max: 1,
    step: 0.025,
  })
  if (kind === "integer") return Object.freeze({...base, kind, value: 3, min: 0, max: 100})
  if (kind === "boolean") return Object.freeze({...base, kind, value: true, presentation: "switch"})
  if (kind === "enum") return Object.freeze({
    ...base,
    kind,
    value: "multiply",
    options: Object.freeze([
      Object.freeze({value: "add", label: "Сложение"}),
      Object.freeze({value: "multiply", label: "Умножение"}),
      Object.freeze({value: "power", label: "Степень"}),
    ]),
  })
  if (kind === "color") return Object.freeze({
    ...base,
    kind,
    value: Object.freeze({r: 0.18, g: 0.58, b: 0.92, a: 1}),
  })
  if (kind === "vector") return Object.freeze({
    ...base,
    kind,
    value: Object.freeze([1, 2, 3]),
    dimensions: 3,
    axes: Object.freeze(["X", "Y", "Z"]),
    step: 0.1,
    precision: 2,
  })
  if (kind === "rotation") return Object.freeze({
    ...base,
    kind,
    value: Object.freeze([0, 45, 90]),
    dimensions: 3,
    axes: Object.freeze(["X", "Y", "Z"]),
    step: 1,
    precision: 1,
    unit: "°",
  })
  if (kind === "matrix") return Object.freeze({
    ...base,
    kind,
    value: Object.freeze([
      Object.freeze([1, 0]),
      Object.freeze([0, 1]),
    ]),
  })
  if (kind === "reference") return Object.freeze({
    ...base,
    kind,
    value: Object.freeze({id: "material-1", label: "Material.001", kind: "material"}),
    placeholder: "Не выбрано",
  })
  if (kind === "collection") return Object.freeze({
    ...base,
    kind,
    items: Object.freeze([
      Object.freeze({id: "position", label: "Позиция"}),
      Object.freeze({id: "normal", label: "Нормаль"}),
      Object.freeze({id: "rotation", label: "Вращение"}),
    ]),
    selectedId: "rotation",
    visibleRows: 3,
  })
  if (kind === "path") return Object.freeze({
    ...base,
    kind,
    value: "/textures/source.exr",
    placeholder: "Выберите файл",
  })
  return Object.freeze({...base, kind: "readonly", value: "Готово"})
}
