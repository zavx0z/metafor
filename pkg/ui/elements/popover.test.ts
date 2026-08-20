import {describe, expect, test} from "bun:test"
import {
  popover,
  planPopoverPlacement,
  type PopoverContext,
} from "./popover.ts"
import {
  UiSurface as BaseUiSurface,
  type DismissableLayerOptions,
} from "./surface.ts"
import type {UiSurfaceRect} from "./runtime.ts"

class RecordingSurface extends BaseUiSurface {
  readonly scope: object
  viewport: UiSurfaceRect = {x: 0, y: 0, w: 240, h: 180}
  readonly dismissables: DismissableLayerOptions[] = []
  readonly keyedRenders: string[] = []

  constructor(scope: object = {}) {
    super({bgColor: null, borderColor: null})
    this.scope = scope
  }

  override interactionScope(): object {
    return this.scope
  }

  override interactionViewport(): UiSurfaceRect {
    return this.viewport
  }

  override dismissableLayer(options: DismissableLayerOptions): void {
    this.dismissables.push(options)
  }

  override requestKeyedRender(key: string): void {
    this.keyedRenders.push(key)
  }

  protected render(): void {}
}

type PopoverRender = Readonly<{
  trigger: PopoverContext
  content?: PopoverContext
  rect?: UiSurfaceRect
}>

function drawPopover(
  surface: RecordingSurface,
  key: string,
  events: boolean[],
  open?: boolean,
): PopoverRender {
  let trigger: PopoverContext | undefined
  let content: PopoverContext | undefined
  let rect: UiSurfaceRect | undefined
  popover(surface, 20, 20, 80, 22, {
    key,
    ...(open === undefined ? {} : {open}),
    contentSize: {width: 120, height: 80},
    onOpenChange: (next) => events.push(next),
    trigger: (context) => { trigger = context },
    content: (contentRect, context) => {
      rect = contentRect
      content = context
    },
  })
  expect(trigger).toBeDefined()
  return {trigger: trigger!, ...(content === undefined ? {} : {content}), ...(rect === undefined ? {} : {rect})}
}

describe("Elements popover", () => {
  test("owns uncontrolled open/reclick/outside/Escape without duplicate close callbacks", () => {
    const surface = new RecordingSurface()
    const events: boolean[] = []
    const closed = drawPopover(surface, "menu", events)
    expect(closed.trigger.open).toBeFalse()
    closed.trigger.toggle()
    expect(events).toEqual([true])

    const opened = drawPopover(surface, "menu", events)
    expect(opened.trigger.open).toBeTrue()
    expect(opened.content?.open).toBeTrue()
    expect(opened.rect).toBeDefined()
    expect(surface.dismissables.at(-1)?.regions).toEqual([
      {x: 20, y: 20, w: 80, h: 22},
      opened.rect!,
    ])
    surface.dismissables.at(-1)?.dismiss("outside")
    surface.dismissables.at(-1)?.dismiss("outside")
    expect(events).toEqual([true, false])
    expect(drawPopover(surface, "menu", events).trigger.open).toBeFalse()

    drawPopover(surface, "menu", events).trigger.toggle()
    const reopened = drawPopover(surface, "menu", events)
    surface.dismissables.at(-1)?.dismiss("escape")
    expect(reopened.trigger.open).toBeTrue()
    expect(events).toEqual([true, false, true, false])
  })

  test("keeps controlled state owner-authoritative while dismissing once", () => {
    const surface = new RecordingSurface()
    const events: boolean[] = []
    const opened = drawPopover(surface, "controlled", events, true)
    expect(opened.trigger.open).toBeTrue()
    surface.dismissables.at(-1)?.dismiss("outside")
    surface.dismissables.at(-1)?.dismiss("escape")
    expect(events).toEqual([false])
    expect(drawPopover(surface, "controlled", events, true).trigger.open).toBeTrue()
  })

  test("allows one active root chain per runtime scope and preserves detached fallback scopes", () => {
    const scope = {}
    const first = new RecordingSurface(scope)
    const second = new RecordingSurface(scope)
    const firstEvents: boolean[] = []
    const secondEvents: boolean[] = []
    drawPopover(first, "first", firstEvents).trigger.toggle()
    drawPopover(first, "first", firstEvents)
    drawPopover(second, "second", secondEvents).trigger.toggle()
    expect(firstEvents).toEqual([true, false])
    expect(secondEvents).toEqual([true])
    expect(drawPopover(first, "first", firstEvents).trigger.open).toBeFalse()
    expect(drawPopover(second, "second", secondEvents).trigger.open).toBeTrue()

    const detachedA = new RecordingSurface()
    const detachedB = new RecordingSurface()
    const detachedAEvents: boolean[] = []
    const detachedBEvents: boolean[] = []
    drawPopover(detachedA, "detached-a", detachedAEvents).trigger.toggle()
    drawPopover(detachedB, "detached-b", detachedBEvents).trigger.toggle()
    expect(detachedAEvents).toEqual([true])
    expect(detachedBEvents).toEqual([true])
  })

  test("keeps placement inside the viewport and flips bottom to top", () => {
    expect(planPopoverPlacement(
      {x: 170, y: 140, w: 50, h: 22},
      {width: 120, height: 80},
      {x: 0, y: 0, w: 240, h: 180},
      2,
    )).toEqual({x: 120, y: 58, w: 120, h: 80, side: "top"})
    expect(planPopoverPlacement(
      {x: 10, y: 10, w: 40, h: 20},
      {width: 400, height: 300},
      {x: 5, y: 5, w: 180, h: 120},
      2,
    )).toEqual({x: 5, y: 5, w: 180, h: 120, side: "bottom"})
  })
})
