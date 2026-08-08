import {Button, Pane, StatusChip, Typography} from "@ui/components"
import {UiSurface, flexColumn, flexRow, type UiSurfaceOpts} from "@ui/elements"
import type {NodeSystemAction, NodeSystemNode} from "./model.ts"

export type NodeInspectorSurfaceOptions = UiSurfaceOpts & Readonly<{
  title?: string
  onAction?: (node: NodeSystemNode, action: NodeSystemAction) => void
}>

export type NodeInspectorRow = Readonly<{
  id: string
  label: string
  value: string
}>

export function nodeInspectorRows(node: NodeSystemNode): readonly NodeInspectorRow[] {
  return [
    {id: "identity", label: "Identity", value: node.id},
    ...(node.kind === undefined ? [] : [{id: "kind", label: "Kind", value: node.kind}]),
    ...(node.facts ?? []).map((fact) => ({id: fact.id, label: fact.label, value: fact.value})),
  ]
}

/** Separate inspector surface; action callbacks are never serialized into the model. */
export class NodeInspectorSurface extends UiSurface {
  readonly #title: string
  readonly #onAction: ((node: NodeSystemNode, action: NodeSystemAction) => void) | undefined
  #node: NodeSystemNode | null = null

  constructor(options: NodeInspectorSurfaceOptions = {}) {
    super({
      bgColor: options.bgColor ?? null,
      borderColor: options.borderColor ?? null,
      ...(options.borderWidthPx === undefined ? {} : {borderWidthPx: options.borderWidthPx}),
      ...(options.borderRadiusPx === undefined ? {} : {borderRadiusPx: options.borderRadiusPx}),
      ...(options.padding === undefined ? {} : {padding: options.padding}),
    })
    this.#title = options.title ?? "INSPECTOR"
    this.#onAction = options.onAction
    this.node.name = "NodeInspectorSurface"
  }

  get inspectedNode(): NodeSystemNode | null {
    return this.#node
  }

  inspect(node: NodeSystemNode | null): void {
    if (this.#node === node) return
    this.#node = node
    this.requestRender()
  }

  protected override render(): void {
    Pane(this, 0, 0, this.rectW, this.rectH, {variant: "filled", key: "node-inspector"})
    flexColumn({
      x: 0,
      y: 0,
      w: this.rectW,
      h: this.rectH,
      paddingLeft: 18,
      paddingRight: 18,
      paddingBottom: 18,
      items: [
        {height: 42, draw: (x, y, w, h) => this.#drawHeader(x, y, w, h)},
        {height: "grow", draw: (x, y, w, h) => this.#drawBody(x, y, w, h)},
      ],
    })
  }

  #drawHeader(x: number, y: number, w: number, h: number): void {
    flexRow({
      x,
      y,
      w,
      h,
      alignItems: "stretch",
      items: [{width: "grow", height: h, draw: (slotX, slotY, slotW, slotH) => {
        Typography(this, slotX, slotY, slotW, slotH, {
          children: this.#title,
          variant: "caption",
          color: "cyan",
        })
      }}],
    })
  }

  #drawBody(x: number, y: number, w: number, h: number): void {
    const node = this.#node
    if (node === null) {
      flexColumn({
        x,
        y,
        w,
        h,
        items: [{height: "grow", draw: (slotX, slotY, slotW, slotH) => {
          flexRow({
            x: slotX,
            y: slotY,
            w: slotW,
            h: slotH,
            alignItems: "center",
            items: [{width: "grow", height: 24, draw: (textX, textY, textW, textH) => {
              Typography(this, textX, textY, textW, textH, {
                children: "Select a node",
                color: "muted",
                sx: {textAlign: "center"},
              })
            }}],
          })
        }}],
      })
      return
    }

    const actions = node.actions ?? []
    flexColumn({
      x,
      y,
      w,
      h,
      gap: 8,
      items: [
        {height: 28, draw: (slotX, slotY, slotW, slotH) => {
          Typography(this, slotX, slotY, slotW, slotH, {children: node.title, variant: "title", color: "text"})
        }},
        {height: 23, draw: (slotX, slotY, slotW, slotH) => {
          flexRow({
            x: slotX,
            y: slotY,
            w: slotW,
            h: slotH,
            items: [{width: "grow", height: slotH, draw: (chipX, chipY, chipW, chipH) => {
              StatusChip(this, chipX, chipY, chipW, chipH, {
                label: node.kind ?? "node",
                tone: node.tone ?? "neutral",
                variant: "subtle",
              })
            }}],
          })
        }},
        {height: actions.length === 0 ? "grow" : "2fr", draw: (slotX, slotY, slotW, slotH) => {
          this.#drawRows(nodeInspectorRows(node), slotX, slotY, slotW, slotH)
        }},
        actions.length === 0 ? false : {height: "1fr", draw: (slotX, slotY, slotW, slotH) => {
          this.#drawActions(node, actions, slotX, slotY, slotW, slotH)
        }},
      ],
    })
  }

  #drawRows(rows: readonly NodeInspectorRow[], x: number, y: number, w: number, h: number): void {
    const rowHeight = 22
    const gap = 2
    const capacity = Math.max(0, Math.floor((h + gap) / (rowHeight + gap)))
    const visible = rows.slice(0, capacity)
    flexColumn({
      x,
      y,
      w,
      h,
      gap,
      items: visible.map((row) => ({
        height: rowHeight,
        draw: (rowX: number, rowY: number, rowW: number, rowH: number) => {
          flexRow({
            x: rowX,
            y: rowY,
            w: rowW,
            h: rowH,
            gap: 8,
            items: [
              {width: "1fr", height: rowH, draw: (slotX, slotY, slotW, slotH) => {
                Typography(this, slotX, slotY, slotW, slotH, {children: row.label, variant: "caption", fontPx: 9, color: "muted"})
              }},
              {width: "2fr", height: rowH, draw: (slotX, slotY, slotW, slotH) => {
                Typography(this, slotX, slotY, slotW, slotH, {
                  children: row.value,
                  variant: "caption",
                  fontPx: 9,
                  color: "text",
                  sx: {textAlign: "right"},
                })
              }},
            ],
          })
        },
      })),
    })
  }

  #drawActions(
    node: NodeSystemNode,
    actions: readonly NodeSystemAction[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const buttonHeight = 28
    const gap = 6
    const capacity = Math.max(0, Math.floor((h + gap) / (buttonHeight + gap)))
    flexColumn({
      x,
      y,
      w,
      h,
      gap,
      justifyContent: "end",
      items: actions.slice(0, capacity).map((action) => ({
        height: buttonHeight,
        draw: (slotX: number, slotY: number, slotW: number, slotH: number) => {
          Button(this, slotX, slotY, slotW, slotH, {
            label: action.label,
            variant: "outlined",
            tone: action.tone ?? "neutral",
            disabled: action.enabled === false,
            action: () => this.#onAction?.(node, action),
          })
        },
      })),
    })
  }
}
