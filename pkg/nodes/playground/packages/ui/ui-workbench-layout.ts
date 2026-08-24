import {flexRowCss} from "@ui/elements"
import {planPlaygroundShell, type PlaygroundFrame} from "@ui/playground"
import {nodePlaygroundGroup, type NodePlaygroundRoute} from "./ui-navigation.ts"

export type NodeComponentPlaygroundFrames = Readonly<{
  backdrop: PlaygroundFrame
  catalog: PlaygroundFrame
  section: PlaygroundFrame
  editor: PlaygroundFrame
  sockets: PlaygroundFrame
  storyPreview: PlaygroundFrame
  reference: PlaygroundFrame
  detail: PlaygroundFrame
  dock: PlaygroundFrame
  story: PlaygroundFrame
}>

const hidden = (): PlaygroundFrame => ({x: 0, y: 0, w: 0, h: 0, visible: false})

/** Adapts the generic shell only to package-specific preview surfaces. */
export function planNodeComponentPlaygroundFrames(
  width: number,
  height: number,
  route: NodePlaygroundRoute = "node-editor/scene/default",
): NodeComponentPlaygroundFrames {
  const compact = width < 980
  const shell = planPlaygroundShell(width, height, compact ? {
    collapsed: ["catalog", "section", "info"],
    dockHeight: 0,
  } : {})
  let editor = hidden()
  let sockets = hidden()
  let storyPreview = hidden()
  let reference = hidden()
  let detail = hidden()
  const story = compact ? hidden() : shell.info
  const group = nodePlaygroundGroup(route)
  if (group === "editor") editor = shell.preview
  else if (group === "socket") {
    storyPreview = shell.preview
  }
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
    storyPreview,
    reference,
    detail,
    dock: compact ? hidden() : shell.dock,
    story,
  }
}
