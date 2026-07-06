import {UiSurface, palette, uiIcons, type UiSurfaceRect} from "@ui/elements"
import {IconButton, Switcher} from "@ui/components"
import {HudSideTab, HudWindow, type HudSideTabEdge} from "@ui/hud"
import {
  beginPaneFrameDrag,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
} from "@ui/panes"
import {t} from "./i18n.ts"
import {clampNumber, withAlpha} from "./geometry.ts"

const HUD_PANEL_BG = withAlpha(palette.bg, 0.68)
const HOST_TERMINAL_DOCK_LONG_PRESS_MS = 320
const HOST_TERMINAL_DOCK_DRAG_THRESHOLD_PX = 6

export type HostTerminalDockPaneOptions = {
  key: string
  label: string
  tooltip: string | (() => string)
  icon?: string | (() => string)
  edge(): HudSideTabEdge
  restore(): void
  moveTo(point: {x: number; y: number}, bounds: {w: number; h: number}): void
  isTouchPointerEvent(event: MouseEvent): boolean
}

export class HostTerminalDockPane extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    startX: number
    startY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
    touch: boolean
  } | null = null
  #suppressRestoreClick = false
  readonly #options: HostTerminalDockPaneOptions

  constructor(options: HostTerminalDockPaneOptions) {
    super({bgColor: null, borderColor: null})
    this.#options = options
    this.node.name = "HostTerminalDockPane"
  }

  protected render(): void {
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: this.#options.key,
      edge: this.#options.edge(),
      icon: typeof this.#options.icon === "function" ? this.#options.icon() : (this.#options.icon ?? uiIcons.codex),
      label: this.#options.label,
      tone: "neutral",
      tooltip: typeof this.#options.tooltip === "function" ? this.#options.tooltip() : this.#options.tooltip,
      onClick: () => this.#restoreFromClick(),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    const touch = this.#options.isTouchPointerEvent(event)
    if (touch) event.preventDefault()
    const point = this.#canvasPoint(event)
    if (point === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      startX: point.x,
      startY: point.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      touch,
    }
    press.timer = setTimeout(() => {
      if (this.#press !== press) return
      press.dragging = true
      this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
    }, HOST_TERMINAL_DOCK_LONG_PRESS_MS)
    this.#press = press
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    if (press === null) {
      super.onPointerMove(event, localX, localY)
      return
    }
    const point = this.#canvasPoint(event)
    if (point !== null) {
      press.lastX = point.x
      press.lastY = point.y
      if (!press.dragging && !press.touch && Math.hypot(press.lastX - press.startX, press.lastY - press.startY) >= HOST_TERMINAL_DOCK_DRAG_THRESHOLD_PX) {
        press.dragging = true
      }
    }
    if (!press.dragging) {
      super.onPointerMove(event, localX, localY)
      return
    }
    event.preventDefault()
    this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
    if (this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "grabbing"
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
    const wasDragging = press?.dragging === true
    if (wasDragging) this.#suppressRestoreClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressRestoreClick = false
  }

  override onPointerLeave(): void {
    if (this.#press !== null) return
    super.onPointerLeave()
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#cancelPress()
  }

  override dispose(): void {
    this.#cancelPress()
    super.dispose()
  }

  #restoreFromClick(): void {
    if (this.#suppressRestoreClick) return
    this.#options.restore()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #moveDockToCanvasPoint(point: {x: number; y: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    this.#options.moveTo(point, frame.bounds)
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }
}

export class SqliteHudFramePane extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null
  readonly #title: () => string
  readonly #subtitle: () => string
  readonly #onDock: () => void
  readonly #onPreviewRect: (rect: UiSurfaceRect) => void
  readonly #onCommitRect: (rect: UiSurfaceRect) => void
  readonly #headerHeight: number
  readonly #minW: number
  readonly #minH: number

  constructor(opts: {
    title: () => string
    subtitle: () => string
    onDock: () => void
    onPreviewRect: (rect: UiSurfaceRect) => void
    onCommitRect: (rect: UiSurfaceRect) => void
    headerHeight: number
    minW: number
    minH: number
  }) {
    super({bgColor: null, borderColor: null})
    this.node.name = "SqliteHudFramePane"
    this.#title = opts.title
    this.#subtitle = opts.subtitle
    this.#onDock = opts.onDock
    this.#onPreviewRect = opts.onPreviewRect
    this.#onCommitRect = opts.onCommitRect
    this.#headerHeight = opts.headerHeight
    this.#minW = opts.minW
    this.#minH = opts.minH
  }

  protected render(): void {
    const subtitle = this.#subtitle()
    HudWindow(this, 0, 0, this.rectW, this.rectH, {
      title: "SQLite",
      subtitle: subtitle.length > 0 ? subtitle : this.#title(),
      onMinimize: this.#onDock,
      minimizeLabel: "Dock SQLite",
      active: this.active,
      fill: HUD_PANEL_BG,
      border: this.active ? palette.windowActiveBorder : palette.borderDim,
      height: this.#headerHeight - 1,
      titleFontPx: 13,
      subtitleFontPx: 9,
      ruleColor: palette.borderDim,
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null || event.button !== 0) return
    this.#beginFrameInteraction(event, localX, localY)
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#frameDrag !== null) {
      this.#updateFrameInteraction(event)
      return
    }
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    if (this.#frameDrag === null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "default"
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#frameDrag = null
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: true,
      resizable: true,
      minW: this.#minW,
      minH: this.#minH,
    }
  }

  #beginFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    const opts = this.#frameInteractionOpts()
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, opts)
    if (kind === null) return false
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return false
    this.#frameDrag = beginPaneFrameDrag(kind, event, frame.rect, opts)
    event.preventDefault()
    const cursor = paneFrameCursor(kind, true)
    if (cursor !== null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = cursor
    return true
  }

  #updateFrameInteraction(event: MouseEvent): boolean {
    const drag = this.#frameDrag
    const frame = this.canvas?.surfaceFrame(this)
    if (drag === null || frame === undefined || frame === null) return false
    const next = paneFrameDragRect(drag, event, frame.bounds)
    const applied = this.canvas?.setSurfaceRect(this, next)
    if (applied !== undefined && applied !== null) this.#onPreviewRect(applied)
    const cursor = paneFrameCursor(drag.kind, true)
    if (cursor !== null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = cursor
    return true
  }

  #endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    if (this.#frameDrag === null) return false
    this.#updateFrameInteraction(event)
    const frame = this.canvas?.surfaceFrame(this)
    this.#frameDrag = null
    this.#syncFrameCursor(localX, localY)
    if (frame !== undefined && frame !== null) this.#onCommitRect(frame.rect)
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    if (this.canvas.canvas !== undefined) this.canvas.canvas.style.cursor = cursor ?? "default"
  }
}

export class HostTerminalAgentSignalPane extends UiSurface {
  #open = false
  readonly #opts: {
    buttonSize: number
    maxVolume: number
    readEnabled(): boolean
    readVolume(): number
    storeEnabled(enabled: boolean): void
    storeVolume(volume: number): void
    relayout(): void
    clampVolume(value: number): number
  }

  constructor(opts: {
    buttonSize: number
    maxVolume: number
    readEnabled(): boolean
    readVolume(): number
    storeEnabled(enabled: boolean): void
    storeVolume(volume: number): void
    relayout(): void
    clampVolume(value: number): number
  }) {
    super({bgColor: null, borderColor: null})
    this.node.name = "HostTerminalAgentSignalPane"
    this.#opts = opts
  }

  isOpen(): boolean {
    return this.#open
  }

  toggle(): void {
    this.#setOpen(!this.#open)
  }

  protected render(): void {
    if (this.#open) this.#drawPanel()
  }

  containsPointer(localX: number, localY: number): boolean {
    if (!this.#open) return false
    return localX >= 0 && localX <= this.rectW && localY >= 0 && localY <= this.rectH
  }

  #drawPanel(): void {
    const w = this.rectW
    const panelY = 0
    const panelH = Math.max(1, this.rectH)
    const pad = 12
    const enabled = this.#opts.readEnabled()
    const volume = this.#opts.readVolume()
    this.drawRoundedRect(0, panelY, w, panelH, {
      radius: 8,
      fill: HUD_PANEL_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: 0.1,
    })
    this.drawText(t("terminalAgentSignal"), pad, panelY + 10, {
      fontPx: 11,
      material: this.materials.text,
      maxWidthPx: Math.max(1, w - pad * 2 - this.#opts.buttonSize - 8),
      z: 0.32,
    })
    const switchW = 44
    const switchH = 22
    const switchX = Math.max(pad, w - pad - switchW)
    const switchY = panelY + 38
    this.drawText(t("terminalAgentSignalDescription"), pad, panelY + 43, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, switchX - pad - 10),
      z: 0.32,
    })
    Switcher(this, switchX, switchY, switchW, switchH, {
      checked: enabled,
      color: "primary",
      key: "host-terminal-agent-signal-enabled-switch",
      tooltip: t("terminalAgentSignal"),
      onChange: this.#opts.storeEnabled,
      sx: {zIndex: 0.18},
    })
    this.#drawVolumeControl(pad, panelY + 76, Math.max(1, w - pad * 2), volume)
  }

  #drawVolumeControl(x: number, y: number, w: number, value: number): void {
    const maxValue = this.#opts.maxVolume
    const clamped = this.#opts.clampVolume(value)
    const ratio = maxValue <= 0 ? 0 : clamped / maxValue
    const label = `${t("terminalAgentSignalVolume")}: ${Math.round(clamped * 100)}%`
    this.drawText(label, x, y - 17, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, w),
      z: 0.32,
    })

    const buttonW = 28
    IconButton(this, x, y, buttonW, 22, {
      label: t("terminalAgentSignalVolumeDown"),
      iconSrc: uiIcons.minus,
      action: () => this.#setVolume(clamped - 0.1),
    })
    IconButton(this, x + w - buttonW, y, buttonW, 22, {
      label: t("terminalAgentSignalVolumeUp"),
      iconSrc: uiIcons.plus,
      action: () => this.#setVolume(clamped + 0.1),
    })

    const trackX = x + buttonW + 10
    const trackW = Math.max(1, w - buttonW * 2 - 20)
    const trackY = y + 8
    this.drawRoundedRect(trackX, trackY, trackW, 6, {
      radius: 3,
      fill: palette.borderDim,
      border: null,
      opacity: 0.42,
      z: 0.16,
    })
    this.drawRoundedRect(trackX, trackY, Math.max(3, trackW * ratio), 6, {
      radius: 3,
      fill: palette.cyan,
      border: null,
      opacity: 0.64,
      z: 0.18,
    })
    const knobX = trackX + trackW * ratio
    this.drawRoundedRect(knobX - 5, trackY - 4, 10, 14, {
      radius: 5,
      fill: palette.cyan,
      border: palette.borderBright,
      borderWidth: 1,
      opacity: 0.86,
      z: 0.22,
    })
    const setFromPointer = (localX: number): void => this.#setVolume(((localX - trackX) / trackW) * maxValue)
    this.hit(trackX - 4, y, trackW + 8, 22, () => undefined, {
      key: "host-terminal-agent-signal-volume-track",
      cursor: "pointer",
      onPointerDown: (localX) => setFromPointer(localX),
      onPointerMove: (localX) => setFromPointer(localX),
    })
  }

  #setVolume(value: number): void {
    this.#opts.storeVolume(Math.round(this.#opts.clampVolume(value) * 20) / 20)
    this.requestRender()
  }

  #setOpen(open: boolean): void {
    if (this.#open === open) return
    this.#open = open
    this.#opts.relayout()
    this.requestRender()
  }
}
