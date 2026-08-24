import {Button} from "@ui/components/button"
import {Pane} from "@ui/components/pane"
import {Typography} from "@ui/components/typography"
import {
  UiSurface,
  flexColumnCss,
  flexRowCss,
  uiShapeMetrics,
  type UiSurfaceRect,
} from "@ui/elements"

export type PlaygroundOverviewItem<Route extends string = string> = Readonly<{
  id: string
  label: string
  description?: string
  route: Route
}>

export type PlaygroundOverviewOptions<Route extends string = string> = Readonly<{
  title: string
  description?: string
  items: readonly PlaygroundOverviewItem<Route>[]
  onNavigate(route: Route): void
}>

export type PlaygroundOverviewPlan = Readonly<{
  title: UiSurfaceRect
  description: UiSurfaceRect | null
  items: readonly Readonly<{id: string; frame: UiSurfaceRect}>[]
  contentWidth: number
  contentHeight: number
}>

const OVERVIEW_SCROLL_KEY = "playground-overview-scroll"
const CARD_HEIGHT = 48

/** Plans one scrollable level of a package route hierarchy through FlexBox. */
export function planPlaygroundOverview(
  width: number,
  title: string,
  description: string | undefined,
  items: readonly Readonly<{id: string}>[],
): PlaygroundOverviewPlan {
  if (title.trim().length === 0) throw new Error("Playground overview title must not be empty")
  const ids = new Set<string>()
  for (const item of items) {
    if (item.id.trim().length === 0) throw new Error("Playground overview item id must not be empty")
    if (ids.has(item.id)) throw new Error(`Duplicate playground overview item: ${item.id}`)
    ids.add(item.id)
  }

  const inset = uiShapeMetrics.tightGap * 2
  const gap = uiShapeMetrics.panelSectionGap
  const contentWidth = Math.max(1, width)
  const innerWidth = Math.max(1, contentWidth - inset * 2)
  const columns = innerWidth >= 620 ? 2 : 1
  const rows = Array.from({length: Math.ceil(items.length / columns)}, (_, row) =>
    items.slice(row * columns, row * columns + columns))
  const titleHeight = uiShapeMetrics.panelHeaderHeight
  const descriptionHeight = description === undefined ? 0 : uiShapeMetrics.rowHeight
  const rowHeights = rows.map(() => CARD_HEIGHT)
  const contentHeight = inset * 2 + titleHeight + descriptionHeight +
    gap * Math.max(0, 1 + (description === undefined ? 0 : 1) + rows.length - 1) +
    rowHeights.reduce((sum, height) => sum + height, 0)
  let titleFrame: UiSurfaceRect = {x: inset, y: inset, w: innerWidth, h: titleHeight}
  let descriptionFrame: UiSurfaceRect | null = null
  const itemFrames: Array<Readonly<{id: string; frame: UiSurfaceRect}>> = []

  flexColumnCss({
    x: inset,
    y: inset,
    w: innerWidth,
    h: Math.max(1, contentHeight - inset * 2),
    gap,
    items: [
      {height: titleHeight, draw: (x, y, w, h) => { titleFrame = {x, y, w, h} }},
      description === undefined ? false : {
        height: descriptionHeight,
        draw: (x: number, y: number, w: number, h: number) => { descriptionFrame = {x, y, w, h} },
      },
      ...rows.map((row) => ({
        height: CARD_HEIGHT,
        draw: (x: number, y: number, w: number, h: number) => flexRowCss({
          x,
          y,
          w,
          h,
          gap,
          items: row.map((item) => ({
            width: "1fr" as const,
            draw: (itemX: number, itemY: number, itemWidth: number, itemHeight: number) => {
              itemFrames.push({id: item.id, frame: {x: itemX, y: itemY, w: itemWidth, h: itemHeight}})
            },
          })),
        }),
      })),
    ],
  })

  return Object.freeze({
    title: Object.freeze(titleFrame),
    description: descriptionFrame === null ? null : Object.freeze(descriptionFrame),
    items: Object.freeze(itemFrames.map((item) => Object.freeze({id: item.id, frame: Object.freeze(item.frame)}))),
    contentWidth,
    contentHeight: Math.max(1, contentHeight),
  })
}

/** Generic package/component/section overview; consumer stories stay outside it. */
export class PlaygroundOverviewSurface<Route extends string = string> extends UiSurface {
  #options: PlaygroundOverviewOptions<Route>

  constructor(options: PlaygroundOverviewOptions<Route>) {
    super({bgColor: null, borderColor: null})
    this.node.name = "PlaygroundOverviewSurface"
    this.#options = normalizeOverviewOptions(options)
  }

  setOptions(options: PlaygroundOverviewOptions<Route>): void {
    this.#options = normalizeOverviewOptions(options)
    this.requestRender()
  }

  protected override render(): void {
    const options = this.#options
    const plan = planPlaygroundOverview(this.rectW, options.title, options.description, options.items)
    Pane(this, 0, 0, this.rectW, this.rectH, {
      appearance: "box",
      key: OVERVIEW_SCROLL_KEY,
      scrollContentWidth: plan.contentWidth,
      scrollContentHeight: plan.contentHeight,
      children: ({scrollLeft, scrollTop, viewportWidth}) => {
        Typography(this, plan.title.x - scrollLeft, plan.title.y - scrollTop, plan.title.w, plan.title.h, {
          children: options.title,
          variant: "title",
          fontPx: uiShapeMetrics.compactFontPx,
        })
        if (plan.description !== null && options.description !== undefined) {
          Typography(
            this,
            plan.description.x - scrollLeft,
            plan.description.y - scrollTop,
            Math.max(plan.description.w, viewportWidth),
            plan.description.h,
            {
              children: options.description,
              variant: "caption",
              fontPx: uiShapeMetrics.compactFontPx,
            },
          )
        }
        for (const planned of plan.items) {
          const item = options.items.find(({id}) => id === planned.id)
          if (item === undefined) continue
          Button(
            this,
            planned.frame.x - scrollLeft,
            planned.frame.y - scrollTop,
            planned.frame.w,
            planned.frame.h,
            {
              children: item.label,
              variant: "glass",
              color: "neutral",
              appearance: "toolbar-item",
              fontPx: uiShapeMetrics.compactFontPx,
              onClick: () => options.onNavigate(item.route),
            },
          )
        }
      },
      sx: {
        padding: 0,
        overflow: "auto",
        scrollbarWidth: uiShapeMetrics.tightGap,
      },
    })
  }
}

function normalizeOverviewOptions<Route extends string>(
  options: PlaygroundOverviewOptions<Route>,
): PlaygroundOverviewOptions<Route> {
  if (options.title.trim().length === 0) throw new Error("Playground overview title must not be empty")
  const ids = new Set<string>()
  const items = options.items.map((item) => {
    if (item.id.trim().length === 0) throw new Error("Playground overview item id must not be empty")
    if (item.label.trim().length === 0) throw new Error(`Playground overview item label must not be empty: ${item.id}`)
    if (ids.has(item.id)) throw new Error(`Duplicate playground overview item: ${item.id}`)
    ids.add(item.id)
    return Object.freeze({...item})
  })
  return Object.freeze({...options, items: Object.freeze(items)})
}
