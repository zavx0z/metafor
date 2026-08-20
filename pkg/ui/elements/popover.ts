import type {UiSurfaceRect} from "./runtime.ts"
import type {DismissReason, UiSurface} from "./surface.ts"
import {
  activatePopover,
  deactivatePopover,
  dismissPopoverChain,
  popoverChainRegions,
  type ActivePopover,
} from "./popover-owner.ts"

export type PopoverSize = Readonly<{width: number; height: number}>

export type PopoverPlacement = UiSurfaceRect & Readonly<{
  side: "bottom" | "top"
}>

export type PopoverContext = Readonly<{
  open: boolean
  toggle(): void
  close(): void
}>

export type PopoverProps = Readonly<{
  key: string
  parentKey?: string
  open?: boolean
  contentSize: PopoverSize
  gap?: number
  onOpenChange?(open: boolean): void
  trigger(context: PopoverContext): void
  content(rect: PopoverPlacement, context: PopoverContext): void
}>

const internalOpenKeys = new WeakMap<UiSurface, Set<string>>()

/** HTML-like disclosure owner with one active popup chain per attached runtime. */
export function popover(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: PopoverProps,
): void {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return
  const key = props.key.trim()
  if (key.length === 0) throw new Error("popover requires a stable non-empty key")
  const scope = surface.interactionScope()
  const internal = internalOpenKeysFor(surface)
  const open = props.open ?? internal.has(key)
  const anchor = Object.freeze({x, y, w: width, h: height})
  let regions: readonly UiSurfaceRect[] = [anchor]
  let dismissed = false

  const activeRecord = (): ActivePopover => ({
    surface,
    key,
    ...(props.parentKey === undefined ? {} : {parentKey: props.parentKey}),
    regions,
    dismiss: (reason) => setOpen(false, reason),
  })
  const setOpen = (next: boolean, _reason: DismissReason = "outside"): void => {
    if (!next && dismissed) return
    if (!next) dismissed = true
    if (props.open === undefined) {
      if (next) internal.add(key)
      else internal.delete(key)
    }
    if (next) activatePopover(scope, activeRecord())
    else deactivatePopover(scope, key)
    props.onOpenChange?.(next)
    surface.requestKeyedRender(key)
  }
  const context: PopoverContext = Object.freeze({
    open,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
  })
  surface.registerRenderKey(key)
  props.trigger(context)

  if (!open) {
    deactivatePopover(scope, key)
    return
  }
  const placement = planPopoverPlacement(
    anchor,
    props.contentSize,
    surface.interactionViewport(),
    props.gap ?? 1,
  )
  regions = [anchor, placement]
  activatePopover(scope, activeRecord())
  const chainRegions = popoverChainRegions(scope, surface, regions)
  surface.dismissableLayer({
    key,
    regions: chainRegions,
    dismiss: (reason) => dismissPopoverChain(scope, reason),
  })
  props.content(placement, context)
}

/** Pure bottom-start placement with top flip and final viewport clamping. */
export function planPopoverPlacement(
  anchor: UiSurfaceRect,
  requested: PopoverSize,
  viewport: UiSurfaceRect,
  gap = 1,
): PopoverPlacement {
  const viewportWidth = finiteNonNegative(viewport.w)
  const viewportHeight = finiteNonNegative(viewport.h)
  const width = Math.min(finiteNonNegative(requested.width), viewportWidth)
  const height = Math.min(finiteNonNegative(requested.height), viewportHeight)
  const boundedGap = finiteNonNegative(gap)
  const bottomY = anchor.y + anchor.h + boundedGap
  const topY = anchor.y - boundedGap - height
  const bottomFits = bottomY + height <= viewport.y + viewportHeight
  const topFits = topY >= viewport.y
  const below = Math.max(0, viewport.y + viewportHeight - bottomY)
  const above = Math.max(0, anchor.y - boundedGap - viewport.y)
  const side: "bottom" | "top" = bottomFits || (!topFits && below >= above) ? "bottom" : "top"
  const rawY = side === "bottom" ? bottomY : topY
  return Object.freeze({
    x: clamp(anchor.x, viewport.x, viewport.x + viewportWidth - width),
    y: clamp(rawY, viewport.y, viewport.y + viewportHeight - height),
    w: width,
    h: height,
    side,
  })
}

function internalOpenKeysFor(surface: UiSurface): Set<string> {
  let keys = internalOpenKeys.get(surface)
  if (keys === undefined) {
    keys = new Set()
    internalOpenKeys.set(surface, keys)
  }
  return keys
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
