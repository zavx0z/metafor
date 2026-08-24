import {measureFieldLayout} from "@ui/components/field"
import type {NodeRect, PositionedLink, PositionedSocket} from "@nodes/ui/node-editor"
import type {Parameter, ParameterPlan} from "@nodes/ui/parameter"
import type {BlenderLink, BlenderSocket} from "@nodes/ui/blender-node"

export const PARAMETER_STORY_VARIANTS = Object.freeze([
  "field",
  "left",
  "right",
  "both",
  "unconnected",
  "connected",
] as const)

export type ParameterStoryVariant = typeof PARAMETER_STORY_VARIANTS[number]

export type ParameterStoryFixture = Readonly<{
  nodeId: string
  entry: ParameterPlan
  sockets: readonly PositionedSocket<BlenderSocket>[]
  links: readonly PositionedLink<BlenderLink>[]
}>

const PARAMETER_NODE_ID = "parameter-story"
const PARAMETER: Parameter = Object.freeze({
  id: "translation",
  label: "Перемещение",
  description: "Один Parameter владеет одним universal Field.",
  field: Object.freeze({
    id: "translation-field",
    label: "Перемещение",
    kind: "vector",
    value: Object.freeze([1, 2, 3]),
    axes: Object.freeze(["X", "Y", "Z"]),
    step: 0.1,
    precision: 2,
  }),
})

const LEFT_SOCKET: BlenderSocket = Object.freeze({
  id: "translation-input",
  label: "Перемещение",
  direction: "input",
  parameterId: PARAMETER.id,
  socketType: "vector",
  side: "left",
})

const RIGHT_SOCKET: BlenderSocket = Object.freeze({
  id: "translation-output",
  label: "Перемещение",
  direction: "output",
  parameterId: PARAMETER.id,
  socketType: "vector",
  side: "right",
})

/** Builds one exact Parameter plan while keeping Parameter and Field identity stable. */
export function createParameterStoryFixture(
  variant: ParameterStoryVariant,
  frame: NodeRect,
): ParameterStoryFixture {
  const sockets = parameterSockets(variant, frame)
  const links = parameterLinks(variant, sockets)
  const connectedSocketIds = new Set(links.flatMap(({link}) => [
    ...(link.from.nodeId === PARAMETER_NODE_ID ? [link.from.socketId] : []),
    ...(link.to.nodeId === PARAMETER_NODE_ID ? [link.to.socketId] : []),
  ]))
  const layout = measureFieldLayout(PARAMETER.field, {density: "compact"})
  const separateLabel = sockets.length > 0 && layout.labelRowHeight > 0
  const editorVisible = sockets.length === 0 || sockets.some(({socket}) =>
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
  const side = sockets.length === 0
    ? undefined
    : sockets.every(({side: socketSide}) => socketSide === "right") ? "right" : "left"
  return Object.freeze({
    nodeId: PARAMETER_NODE_ID,
    entry: Object.freeze({
      parameter: PARAMETER,
      rect,
      labelRect,
      editorRect,
      editorVisible,
      separateLabel,
      ...(side === undefined ? {} : {side}),
    }),
    sockets,
    links,
  })
}

function parameterSockets(
  variant: ParameterStoryVariant,
  frame: NodeRect,
): readonly PositionedSocket<BlenderSocket>[] {
  const socketY = frame.y + 11
  const sockets: PositionedSocket<BlenderSocket>[] = []
  if (variant === "left" || variant === "both" || variant === "unconnected" || variant === "connected") {
    sockets.push(Object.freeze({
      socket: LEFT_SOCKET,
      side: "left",
      center: Object.freeze({x: frame.x - 10, y: socketY}),
    }))
  }
  if (variant === "right" || variant === "both") {
    sockets.push(Object.freeze({
      socket: RIGHT_SOCKET,
      side: "right",
      center: Object.freeze({x: frame.x + frame.w + 10, y: socketY}),
    }))
  }
  return Object.freeze(sockets)
}

function parameterLinks(
  variant: ParameterStoryVariant,
  sockets: readonly PositionedSocket<BlenderSocket>[],
): readonly PositionedLink<BlenderLink>[] {
  if (variant !== "connected") return Object.freeze([])
  const target = sockets.find(({socket}) => socket.id === LEFT_SOCKET.id)?.center
  if (target === undefined) throw new Error("Connected Parameter story requires the left Socket")
  return Object.freeze([Object.freeze({
    link: Object.freeze({
      id: "source-translation",
      from: Object.freeze({nodeId: "source", socketId: "translation-output"}),
      to: Object.freeze({nodeId: PARAMETER_NODE_ID, socketId: LEFT_SOCKET.id}),
      socketType: "vector",
    }),
    points: Object.freeze([
      Object.freeze({x: target.x - 130, y: target.y - 46}),
      Object.freeze({x: target.x - 72, y: target.y - 46}),
      Object.freeze({x: target.x - 72, y: target.y}),
      target,
    ]),
  })])
}
