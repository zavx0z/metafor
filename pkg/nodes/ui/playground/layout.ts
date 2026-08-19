import {flexRowCss} from "@ui/elements"
import {planPlaygroundShell, type PlaygroundFrame} from "@ui/playground"
import {nodePlaygroundGroup, type NodePlaygroundRoute} from "./routes.ts"

export type NodeComponentPlaygroundFrames = Readonly<{
  backdrop: PlaygroundFrame
  catalog: PlaygroundFrame
  section: PlaygroundFrame
  editor: PlaygroundFrame
  sockets: PlaygroundFrame
  reference: PlaygroundFrame
  detail: PlaygroundFrame
  dock: PlaygroundFrame
  info: PlaygroundFrame
}>

const hidden = (): PlaygroundFrame => ({x: 0, y: 0, w: 0, h: 0, visible: false})

/** Adapts the generic shell only to package-specific preview surfaces. */
export function planNodeComponentPlaygroundFrames(
  width: number,
  height: number,
  route: NodePlaygroundRoute = "editor/scene",
): NodeComponentPlaygroundFrames {
  const shell = planPlaygroundShell(width, height)
  let editor = hidden()
  let sockets = hidden()
  let reference = hidden()
  let detail = hidden()
  const group = nodePlaygroundGroup(route)
  if (group === "editor") editor = shell.preview
  else if (group === "socket") sockets = shell.preview
  else if (shell.compact) detail = shell.preview
  else flexRowCss({
    x: shell.preview.x,
    y: shell.preview.y,
    w: shell.preview.w,
    h: shell.preview.h,
    gap: 18,
    items: [
      {width: "1fr", draw: (x, y, w, h) => { reference = {x, y, w, h} }},
      {width: "1fr", draw: (x, y, w, h) => { detail = {x, y, w, h} }},
    ],
  })
  return {
    backdrop: {x: 0, y: 0, w: width, h: height},
    catalog: shell.catalog,
    section: shell.section,
    editor,
    sockets,
    reference,
    detail,
    dock: shell.dock,
    info: shell.info,
  }
}
