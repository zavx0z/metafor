import {HudReturnDock, type HudRect} from "@ui/hud"
import {UiSurface} from "@layout/core/surface"

const DOCK_KEY = "main-display-dock"
const DOCK_BRIDGE_KEY = "main-display-dock-bridge"
const BUTTON_KEY = "main-display-dock-button"

type DockGeometry = {
  island: HudRect
  button: HudRect
  hit: HudRect
}

/** HUD-owned navigation dock for the standard Space display. */
export class DisplayDockSurface extends UiSurface {
  readonly #toggleDisplay: () => void
  #pinned = false
  #expanded = false

  constructor(toggleDisplay: () => void) {
    super({bgColor: null, borderColor: null})
    this.#toggleDisplay = toggleDisplay
  }

  /** Leaves the rest of the transparent HUD surface to Space camera input. */
  containsPointer(localX: number, localY: number): boolean {
    const geometry = this.#geometry()
    const point = {x: localX, y: localY}
    return pointInRect(point, geometry.island)
      || (this.#expanded && pointInRect(point, geometry.hit))
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    if (this.#pinned) return
    this.#expanded = false
    this.requestRender()
  }

  protected render(): void {
    const geometry = this.#geometry()
    const dock = this.hitState(
      geometry.island.x,
      geometry.island.y,
      geometry.island.w,
      geometry.island.h,
      DOCK_KEY,
    )
    const bridge = this.hitState(
      geometry.hit.x,
      geometry.hit.y,
      geometry.hit.w,
      geometry.hit.h,
      DOCK_BRIDGE_KEY,
    )
    const button = this.hitState(
      geometry.button.x,
      geometry.button.y,
      geometry.button.w,
      geometry.button.h,
      BUTTON_KEY,
    )
    this.#expanded = this.#pinned
      || dock.hovered
      || dock.pressed
      || bridge.hovered
      || bridge.pressed
      || button.hovered
      || button.pressed

    if (this.#expanded) {
      this.hit(geometry.hit.x, geometry.hit.y, geometry.hit.w, geometry.hit.h, () => {}, {
        key: DOCK_BRIDGE_KEY,
        cursor: "pointer",
        activeCursor: "pointer",
      })
    }

    HudReturnDock(this, {
      island: geometry.island,
      button: geometry.button,
      expanded: this.#expanded,
      dockKey: DOCK_KEY,
      buttonKey: BUTTON_KEY,
      onDockClick: () => {
        this.#pinned = !this.#pinned
        this.#expanded = this.#pinned
        this.requestRender()
      },
      onReturnClick: () => {
        this.#pinned = false
        this.#expanded = false
        this.#toggleDisplay()
        this.requestRender()
      },
    })
  }

  #geometry(): DockGeometry {
    const islandW = clamp(this.rectW * 0.075, 58, 88)
    const islandH = 17
    const islandX = (this.rectW - islandW) / 2
    const islandY = this.rectH - 30
    const size = 38
    const buttonX = this.rectW / 2 - size / 2
    const buttonY = islandY - size - 11
    const hitPad = 16

    return {
      island: {x: islandX, y: islandY, w: islandW, h: islandH},
      button: {x: buttonX, y: buttonY, w: size, h: size},
      hit: {
        x: Math.min(islandX, buttonX) - hitPad,
        y: buttonY - hitPad,
        w: Math.max(islandX + islandW, buttonX + size) - Math.min(islandX, buttonX) + hitPad * 2,
        h: islandY + islandH - buttonY + hitPad * 2,
      },
    }
  }
}

function pointInRect(point: {x: number; y: number}, rect: HudRect): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.w
    && point.y >= rect.y
    && point.y <= rect.y + rect.h
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
