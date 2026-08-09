import {Button, StatusChip, Typography, uiIcons} from "@ui/components"
import {UiSurface, div, flexColumn, flexRow, type UiSurfaceOpts} from "@ui/elements"
import {
  HUD_WINDOW_TITLE_HEIGHT,
  HudSideTab,
  HudWindow,
  type HudPaneFrameChange,
  type HudWindowTitleBarAction,
} from "@ui/hud"
import type {NodeSystemAction, NodeSystemNode} from "./model.ts"

export type NodeInspectorSurfaceOptions = UiSurfaceOpts & Readonly<{
  title?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onFrameRectChange?: (change: HudPaneFrameChange) => void
  onStickFrameRectChange?: (change: HudPaneFrameChange) => void
  titleBarActions?: readonly HudWindowTitleBarAction[]
  onAction?: (node: NodeSystemNode, action: NodeSystemAction) => void
}>

export type NodeInspectorRow = Readonly<{
  id: string
  label: string
  value: string
}>

export function nodeInspectorRows(node: NodeSystemNode): readonly NodeInspectorRow[] {
  return [
    {id: "identity", label: "Идентификатор", value: node.id},
    ...(node.kind === undefined ? [] : [{id: "kind", label: "Тип", value: node.kind}]),
    ...(node.facts ?? []).map((fact) => ({id: fact.id, label: fact.label, value: fact.value})),
  ]
}

export function nodeInspectorValueNeedsTooltip(
  value: string,
  availableWidth: number,
  measureText: (value: string, fontPx: number) => number,
): boolean {
  return measureText(value, 9) > Math.max(0, availableWidth)
}

const INSPECTOR_SECTION_GAP = 8
const INSPECTOR_TITLE_HEIGHT = 28
const INSPECTOR_STATUS_HEIGHT = 23
const INSPECTOR_ROW_HEIGHT = 22
const INSPECTOR_ROW_GAP = 2
const INSPECTOR_ACTION_HEIGHT = 28
const INSPECTOR_ACTION_GAP = 6
export const NODE_INSPECTOR_TITLE_HEIGHT = HUD_WINDOW_TITLE_HEIGHT

export function nodeInspectorRowsHeight(rowCount: number): number {
  const count = Math.max(0, Math.floor(rowCount))
  return count === 0 ? 0 : count * INSPECTOR_ROW_HEIGHT + (count - 1) * INSPECTOR_ROW_GAP
}

export function nodeInspectorActionsHeight(actionCount: number): number {
  const count = Math.max(0, Math.floor(actionCount))
  return count === 0 ? 0 : count * INSPECTOR_ACTION_HEIGHT + (count - 1) * INSPECTOR_ACTION_GAP
}

export function nodeInspectorContentHeight(rowCount: number, actionCount: number, viewportHeight: number): number {
  const actionsHeight = nodeInspectorActionsHeight(actionCount)
  const itemCount = actionCount > 0 ? 5 : 4
  const intrinsicHeight = INSPECTOR_TITLE_HEIGHT
    + INSPECTOR_STATUS_HEIGHT
    + nodeInspectorRowsHeight(rowCount)
    + actionsHeight
    + (itemCount - 1) * INSPECTOR_SECTION_GAP
  return Math.max(Math.max(1, viewportHeight), intrinsicHeight)
}

/** Separate inspector surface; action callbacks are never serialized into the model. */
export class NodeInspectorSurface extends UiSurface {
  readonly #title: string
  readonly #onOpenChange: ((open: boolean) => void) | undefined
  readonly #onFrameRectChange: ((change: HudPaneFrameChange) => void) | undefined
  readonly #onStickFrameRectChange: ((change: HudPaneFrameChange) => void) | undefined
  readonly #titleBarActions: readonly HudWindowTitleBarAction[]
  readonly #onAction: ((node: NodeSystemNode, action: NodeSystemAction) => void) | undefined
  #node: NodeSystemNode | null = null
  #open: boolean

  constructor(options: NodeInspectorSurfaceOptions = {}) {
    super({
      bgColor: options.bgColor ?? null,
      borderColor: options.borderColor ?? null,
      ...(options.borderWidthPx === undefined ? {} : {borderWidthPx: options.borderWidthPx}),
      ...(options.borderRadiusPx === undefined ? {} : {borderRadiusPx: options.borderRadiusPx}),
      ...(options.padding === undefined ? {} : {padding: options.padding}),
    })
    this.#title = options.title ?? "Нода не выбрана"
    this.#open = options.open ?? true
    this.#onOpenChange = options.onOpenChange
    this.#onFrameRectChange = options.onFrameRectChange
    this.#onStickFrameRectChange = options.onStickFrameRectChange
    this.#titleBarActions = [...(options.titleBarActions ?? [])]
    this.#onAction = options.onAction
    this.node.name = "NodeInspectorSurface"
  }

  get inspectedNode(): NodeSystemNode | null {
    return this.#node
  }

  get isOpen(): boolean {
    return this.#open
  }

  setOpen(open: boolean): boolean {
    if (this.#open === open) return false
    this.#open = open
    this.#onOpenChange?.(open)
    this.requestRender()
    return true
  }

  toggleOpen(): boolean {
    return this.setOpen(!this.#open)
  }

  inspect(node: NodeSystemNode | null): void {
    if (this.#node === node) return
    this.#node = node
    this.requestRender()
  }

  protected override render(): void {
    if (!this.#open) {
      this.#drawCollapsed()
      return
    }
    const body = HudWindow(this, 0, 0, this.rectW, this.rectH, {
      title: this.#node?.title ?? this.#title,
      ...(this.#node?.kind === undefined ? {} : {subtitle: this.#node.kind}),
      active: true,
      movable: true,
      resizable: true,
      minWidth: 240,
      minHeight: 220,
      ...(this.#onFrameRectChange === undefined ? {} : {onFrameRectChange: this.#onFrameRectChange}),
      height: NODE_INSPECTOR_TITLE_HEIGHT,
      bodyInsetX: 18,
      bodyTopGap: 8,
      bodyBottomInset: 18,
      onMinimize: () => this.setOpen(false),
      minimizeLabel: "Свернуть инспектор",
      rightActions: this.#titleBarActions,
    })
    this.#drawBody(body.x, body.y, body.w, body.h)
  }

  #drawCollapsed(): void {
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: "node-inspector:return-stick",
      edge: "right",
      icon: uiIcons.expand,
      tooltip: "Открыть инспектор",
      tone: "neutral",
      movable: true,
      ...(this.#onStickFrameRectChange === undefined ? {} : {onFrameRectChange: this.#onStickFrameRectChange}),
      onClick: () => this.setOpen(true),
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
                children: "Выберите ноду",
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
    const rows = nodeInspectorRows(node)
    const contentHeight = nodeInspectorContentHeight(rows.length, actions.length, h)
    div(this, x, y, w, h, {
      key: "node-inspector:body-scroll",
      scrollContentHeight: contentHeight,
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowX: "hidden",
        overflowY: "auto",
        scrollbarWidth: 4,
      },
      children: ({scrollTop, viewportWidth, contentHeight: scrollContentHeight}) => this.#drawNodeContent(
        node,
        rows,
        actions,
        x,
        y - scrollTop,
        viewportWidth,
        scrollContentHeight,
      ),
    })
  }

  #drawNodeContent(
    node: NodeSystemNode,
    rows: readonly NodeInspectorRow[],
    actions: readonly NodeSystemAction[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    flexColumn({
      x,
      y,
      w,
      h,
      gap: INSPECTOR_SECTION_GAP,
      items: [
        {height: INSPECTOR_TITLE_HEIGHT, draw: (slotX, slotY, slotW, slotH) => {
          Typography(this, slotX, slotY, slotW, slotH, {children: node.title, variant: "title", color: "text"})
        }},
        {height: INSPECTOR_STATUS_HEIGHT, draw: (slotX, slotY, slotW, slotH) => {
          flexRow({
            x: slotX,
            y: slotY,
            w: slotW,
            h: slotH,
            items: [{width: "grow", height: slotH, draw: (chipX, chipY, chipW, chipH) => {
              StatusChip(this, chipX, chipY, chipW, chipH, {
                label: node.kind ?? "нода",
                tone: node.tone ?? "neutral",
                variant: "subtle",
              })
            }}],
          })
        }},
        {height: nodeInspectorRowsHeight(rows.length), draw: (slotX, slotY, slotW, slotH) => {
          this.#drawRows(rows, slotX, slotY, slotW, slotH)
        }},
        {height: "grow", draw: () => {}},
        actions.length === 0 ? false : {height: nodeInspectorActionsHeight(actions.length), draw: (slotX, slotY, slotW, slotH) => {
          this.#drawActions(node, actions, slotX, slotY, slotW, slotH)
        }},
      ],
    })
  }

  #drawRows(rows: readonly NodeInspectorRow[], x: number, y: number, w: number, h: number): void {
    flexColumn({
      x,
      y,
      w,
      h,
      gap: INSPECTOR_ROW_GAP,
      items: rows.map((row) => ({
        height: INSPECTOR_ROW_HEIGHT,
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
                if (nodeInspectorValueNeedsTooltip(row.value, slotW, (value, fontPx) => this.measureText(value, fontPx))) {
                  const key = `node-inspector:value:${row.id}`
                  this.hit(slotX, slotY, slotW, slotH, () => {}, {
                    key,
                    cursor: "default",
                    tooltip: {label: row.value, delayMs: 260},
                  })
                  this.drawTooltipForHit(slotX, slotY, slotW, slotH, row.value, {delayMs: 260, anchor: "cursor"})
                }
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
    flexColumn({
      x,
      y,
      w,
      h,
      gap: INSPECTOR_ACTION_GAP,
      justifyContent: "end",
      items: actions.map((action) => ({
        height: INSPECTOR_ACTION_HEIGHT,
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
