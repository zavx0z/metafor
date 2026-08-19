import {flexColumnCss, flexRowCss} from "@ui/elements"
import {playgroundTheme} from "./theme.ts"

export type PlaygroundFrame = Readonly<{x: number; y: number; w: number; h: number; visible?: boolean}>
export type PlaygroundShellFrames = Readonly<{
  compact: boolean
  stage: PlaygroundFrame
  catalog: PlaygroundFrame
  section: PlaygroundFrame
  preview: PlaygroundFrame
  dock: PlaygroundFrame
  info: PlaygroundFrame
}>

export type PlaygroundShellOptions = Readonly<{
  maxWidth?: number
  maxHeight?: number
  compactWidth?: number
  compactHeight?: number
  padding?: number
  gap?: number
  catalogWidth?: number
  sectionWidth?: number
  infoWidth?: number
  dockHeight?: number
}>

const hidden = (): PlaygroundFrame => ({x: 0, y: 0, w: 0, h: 0, visible: false})

export function planPlaygroundShell(
  width: number,
  height: number,
  options: PlaygroundShellOptions = {},
): PlaygroundShellFrames {
  const compact = width <= (options.compactWidth ?? 720) || height <= (options.compactHeight ?? 500)
  const padding = options.padding ?? (compact ? 8 : 18)
  let stage = hidden()
  let catalog = hidden()
  let section = hidden()
  let preview = hidden()
  let dock = hidden()
  let info = hidden()

  if (compact) {
    flexColumnCss({
      x: 0,
      y: 0,
      w: width,
      h: height,
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: padding,
      paddingBottom: padding,
      items: [{height: "1fr", draw: (x, y, w, h) => {
        stage = {x, y, w, h}
        preview = {x, y, w, h}
      }}],
    })
    return {compact, stage, catalog, section, preview, dock, info}
  }

  const stageWidth = Math.max(1, Math.min(options.maxWidth ?? 1660, width - padding * 2))
  const stageHeight = Math.max(1, Math.min(options.maxHeight ?? 860, height - padding * 2))
  flexColumnCss({
    x: 0,
    y: 0,
    w: width,
    h: height,
    items: [
      {height: "1fr", draw: () => {}},
      {height: stageHeight, draw: (rowX, rowY, rowW, rowH) => flexRowCss({
        x: rowX,
        y: rowY,
        w: rowW,
        h: rowH,
        items: [
          {width: "1fr", draw: () => {}},
          {width: stageWidth, draw: (x, y, w, h) => {
            stage = {x, y, w, h}
            flexRowCss({
              x,
              y,
              w,
              h,
              gap: options.gap ?? playgroundTheme.stageGap,
              items: [
                {width: options.catalogWidth ?? playgroundTheme.catalogWidth, draw: (slotX, slotY, slotW, slotH) => { catalog = {x: slotX, y: slotY, w: slotW, h: slotH} }},
                {width: options.sectionWidth ?? playgroundTheme.sectionWidth, draw: (slotX, slotY, slotW, slotH) => { section = {x: slotX, y: slotY, w: slotW, h: slotH} }},
                {width: "1fr", draw: (columnX, columnY, columnW, columnH) => flexColumnCss({
                  x: columnX,
                  y: columnY,
                  w: columnW,
                  h: columnH,
                  gap: options.gap ?? playgroundTheme.stageGap,
                  items: [
                    {height: "1fr", draw: (slotX, slotY, slotW, slotH) => { preview = {x: slotX, y: slotY, w: slotW, h: slotH} }},
                    {height: options.dockHeight ?? playgroundTheme.dockHeight, draw: (slotX, slotY, slotW, slotH) => { dock = {x: slotX, y: slotY, w: slotW, h: slotH} }},
                  ],
                })},
                {width: options.infoWidth ?? playgroundTheme.infoWidth, draw: (slotX, slotY, slotW, slotH) => { info = {x: slotX, y: slotY, w: slotW, h: slotH} }},
              ],
            })
          }},
          {width: "1fr", draw: () => {}},
        ],
      })},
      {height: "1fr", draw: () => {}},
    ],
  })
  return {compact, stage, catalog, section, preview, dock, info}
}
