import {flexColumnCss, flexRowCss} from "@ui/elements"

export type PlaygroundFrame = Readonly<{x: number; y: number; w: number; h: number; visible?: boolean}>
export type NodeComponentPlaygroundFrames = Readonly<{
  fields: PlaygroundFrame
  reference: PlaygroundFrame
  editor: PlaygroundFrame
  sockets: PlaygroundFrame
}>

/** Plans every playground region through the shared Flexbox-oriented system. */
export function planNodeComponentPlaygroundFrames(width: number, height: number): NodeComponentPlaygroundFrames {
  let fields: PlaygroundFrame = {x: 0, y: 0, w: 0, h: 0}
  let reference: PlaygroundFrame = {x: 0, y: 0, w: 0, h: 0}
  let editor: PlaygroundFrame = {x: 0, y: 0, w: 0, h: 0}
  let sockets: PlaygroundFrame = {x: 0, y: 0, w: 0, h: 0}
  if (width <= 720 || height <= 500) {
    fields = {x: 0, y: 0, w: 0, h: 0, visible: false}
    reference = {x: 0, y: 0, w: 0, h: 0, visible: false}
    sockets = {x: 0, y: 0, w: 0, h: 0, visible: false}
    flexColumnCss({
      x: 0,
      y: 0,
      w: width,
      h: height,
      items: [
        {height: 70, draw: () => {}},
        {height: "1fr", draw: (bodyX, bodyY, bodyW, bodyH) => flexColumnCss({
          x: bodyX,
          y: bodyY,
          w: bodyW,
          h: bodyH,
          paddingLeft: 8,
          paddingRight: 8,
          paddingBottom: 8,
          items: [{height: "1fr", draw: (x, y, w, h) => { editor = {x, y, w, h} }}],
        })},
      ],
    })
    return {fields, reference, editor, sockets}
  }
  flexColumnCss({
    x: 0,
    y: 0,
    w: width,
    h: height,
    items: [
      {height: 70, draw: () => {}},
      {height: "1fr", draw: (bodyX, bodyY, bodyW, bodyH) => flexRowCss({
        x: bodyX,
        y: bodyY,
        w: bodyW,
        h: bodyH,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 16,
        gap: 16,
        alignItems: "stretch",
        items: [
          {width: 520, draw: (x, y, w, h) => { fields = {x, y, w, h} }},
          {width: "1fr", draw: (workspaceX, workspaceY, workspaceW, workspaceH) => flexColumnCss({
            x: workspaceX,
            y: workspaceY,
            w: workspaceW,
            h: workspaceH,
            gap: 12,
            items: [
              {height: "2fr", draw: (compareX, compareY, compareW, compareH) => flexRowCss({
                x: compareX,
                y: compareY,
                w: compareW,
                h: compareH,
                gap: 12,
                alignItems: "stretch",
                items: [
                  {width: "1fr", draw: (x, y, w, h) => { reference = {x, y, w, h} }},
                  {width: "1fr", draw: (x, y, w, h) => { editor = {x, y, w, h} }},
                ],
              })},
              {height: "1fr", draw: (x, y, w, h) => { sockets = {x, y, w, h} }},
            ],
          })},
        ],
      })},
    ],
  })
  return {fields, reference, editor, sockets}
}
