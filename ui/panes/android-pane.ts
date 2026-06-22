import {Color, TextMaterial} from "@metafor/engine"
import {Button, IconButton, uiIcons} from "@ui/components"
import {UiSurface, Z, palette, radii, type UiSurfaceRect} from "@ui/elements"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  paneHeaderRuleRect,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
  type PaneRect,
} from "./pane-frame.ts"

export type AndroidPaneStatusKind = "idle" | "connected" | "running" | "error"

export type AndroidPaneFrame = {
  src: string
  width: number
  height: number
  capturedAt?: number
}

export type AndroidPaneSwipe = {
  x1: number
  y1: number
  x2: number
  y2: number
  durationMs: number
}

export type AndroidPaneOpts = {
  title?: string
  draggable?: boolean
  resizable?: boolean
  onRefresh?: () => void
  onTap?: (x: number, y: number) => void
  onSwipe?: (swipe: AndroidPaneSwipe) => void
  onOpenAccessibility?: () => void
  onKey?: (code: string) => void
  onLaunchPackage?: (packageName: string) => void
  onFrameRectPreview?: (rect: PaneRect) => void
  onFrameRectChange?: (rect: PaneRect) => void
  onFrameDockRequest?: () => void
}

type AndroidPoint = {
  x: number
  y: number
}

type AndroidGesture = {
  start: AndroidPoint
  current: AndroidPoint
  startClientX: number
  startClientY: number
  startedAt: number
}

const ANDROID_HEADER_H = PANE_FRAME.headerHeight
const ANDROID_MIN_W = 300
const ANDROID_MIN_H = PANE_FRAME.headerHeight + 300
const ANDROID_TOOLBAR_H = 34
const ANDROID_PANEL_BG = withAlpha(palette.bg, 0.68)
const ANDROID_DEVICE_BG = withAlpha(palette.bgCode, 0.86)
const ANDROID_DEVICE_BORDER = withAlpha(palette.borderDim, 0.88)
const ANDROID_GESTURE_TAP_PX = 14

export class AndroidPane extends UiSurface {
  #title: string
  #statusKind: AndroidPaneStatusKind = "idle"
  #status = "idle"
  #frame: AndroidPaneFrame | null = null
  #deviceWidth = 0
  #deviceHeight = 0
  #draggable: boolean
  #resizable: boolean
  #frameDrag: PaneFrameDrag | null = null
  #gesture: AndroidGesture | null = null
  #lastImageRect: UiSurfaceRect | null = null
  #onRefresh: (() => void) | undefined
  #onTap: ((x: number, y: number) => void) | undefined
  #onSwipe: ((swipe: AndroidPaneSwipe) => void) | undefined
  #onOpenAccessibility: (() => void) | undefined
  #onKey: ((code: string) => void) | undefined
  #onLaunchPackage: ((packageName: string) => void) | undefined
  #onFrameRectPreview: ((rect: PaneRect) => void) | undefined
  #onFrameRectChange: ((rect: PaneRect) => void) | undefined
  #onFrameDockRequest: (() => void) | undefined
  #titleMaterial = new TextMaterial({color: palette.cyan})
  #mutedMaterial = new TextMaterial({color: palette.muted})
  #textMaterial = new TextMaterial({color: palette.text})
  #errorMaterial = new TextMaterial({color: palette.red})

  constructor(opts: AndroidPaneOpts = {}) {
    super({bgColor: null, borderColor: null})
    this.node.name = "AndroidPane"
    this.#title = opts.title ?? "Android"
    this.#draggable = opts.draggable ?? false
    this.#resizable = opts.resizable ?? false
    this.#onRefresh = opts.onRefresh
    this.#onTap = opts.onTap
    this.#onSwipe = opts.onSwipe
    this.#onOpenAccessibility = opts.onOpenAccessibility
    this.#onKey = opts.onKey
    this.#onLaunchPackage = opts.onLaunchPackage
    this.#onFrameRectPreview = opts.onFrameRectPreview
    this.#onFrameRectChange = opts.onFrameRectChange
    this.#onFrameDockRequest = opts.onFrameDockRequest
  }

  setTitle(title: string): void {
    if (this.#title === title) return
    this.#title = title
    this.requestRender()
  }

  setStatus(kind: AndroidPaneStatusKind, label: string): void {
    if (this.#statusKind === kind && this.#status === label) return
    this.#statusKind = kind
    this.#status = label
    this.requestRender()
  }

  setDeviceSize(width: number, height: number): void {
    const w = Math.max(0, Math.round(width))
    const h = Math.max(0, Math.round(height))
    if (this.#deviceWidth === w && this.#deviceHeight === h) return
    this.#deviceWidth = w
    this.#deviceHeight = h
    this.requestRender()
  }

  setFrame(frame: AndroidPaneFrame): void {
    this.#frame = {
      ...frame,
      width: Math.max(1, Math.round(frame.width)),
      height: Math.max(1, Math.round(frame.height)),
    }
    this.#deviceWidth = this.#frame.width
    this.#deviceHeight = this.#frame.height
    this.requestRender()
  }

  frameSnapshot(): AndroidPaneFrame | null {
    return this.#frame === null ? null : {...this.#frame}
  }

  protected render(): void {
    const w = Math.max(ANDROID_MIN_W, this.rectW)
    const h = Math.max(ANDROID_MIN_H, this.rectH)
    this.drawRoundedRect(0, 0, w, h, {
      radius: radii.pane,
      fill: ANDROID_PANEL_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.#renderHeader(w)
    const body = paneBodyRect(w, h, {headerHeight: ANDROID_HEADER_H, insetX: 8, topGap: 8, bottomInset: 8})
    this.#renderBody(body)
  }

  #renderHeader(w: number): void {
    const pad = PANE_FRAME.headerTextX
    const buttonSize = 22
    const hasDock = this.#onFrameDockRequest !== undefined
    const dockButtonX = pad
    const titleX = hasDock ? dockButtonX + buttonSize + 8 : pad
    const refreshButtonX = this.#onRefresh === undefined ? w - pad : w - pad - buttonSize
    const titleMaxW = Math.max(1, refreshButtonX - titleX - 8)
    if (this.#onFrameDockRequest !== undefined) {
      IconButton(this, dockButtonX, 7, buttonSize, buttonSize, {
        label: "Dock Android",
        iconSrc: uiIcons.minus,
        action: this.#onFrameDockRequest,
      })
    }
    this.drawText(this.#title, titleX, PANE_FRAME.headerTextY, {
      fontPx: 13,
      material: this.#titleMaterial,
      maxWidthPx: titleMaxW,
    })
    const titleW = Math.min(titleMaxW, this.measureText(this.#title, 13))
    this.drawText(this.#status, titleX + titleW + 14, PANE_FRAME.headerTextY + 1, {
      fontPx: 10,
      material: this.#statusKind === "error" ? this.#errorMaterial : this.#mutedMaterial,
      maxWidthPx: Math.max(1, refreshButtonX - titleX - titleW - 20),
    })
    if (this.#onRefresh !== undefined) {
      IconButton(this, refreshButtonX, 7, buttonSize, buttonSize, {
        label: "Refresh Android",
        iconSrc: uiIcons.restart,
        action: this.#onRefresh,
      })
    }
    const rule = paneHeaderRuleRect(w, ANDROID_HEADER_H, PANE_FRAME.bodyInsetX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim)
  }

  #renderBody(rect: UiSurfaceRect): void {
    const toolbarY = rect.y + rect.h - ANDROID_TOOLBAR_H
    const availableDeviceRect = {
      x: rect.x + 2,
      y: rect.y + 2,
      w: Math.max(1, rect.w - 4),
      h: Math.max(1, toolbarY - rect.y - 8),
    }
    const deviceRect = this.#deviceShellRect(availableDeviceRect)
    this.drawRoundedRect(deviceRect.x, deviceRect.y, deviceRect.w, deviceRect.h, {
      radius: Math.min(18, radii.pane),
      fill: ANDROID_DEVICE_BG,
      border: ANDROID_DEVICE_BORDER,
      borderWidth: 1,
      z: Z.ELEMENT - 0.03,
    })
    const imageRect = this.#deviceImageRect(deviceRect)
    this.#lastImageRect = imageRect
    if (imageRect !== null && this.#frame !== null) {
      this.drawImage(this.#frame.src, imageRect.x, imageRect.y, imageRect.w, imageRect.h, {
        fit: "contain",
        z: Z.ELEMENT,
      })
      this.#renderGestureOverlay(imageRect)
    } else {
      this.drawText(this.#statusKind === "error" ? this.#status : "Android frame is not loaded", deviceRect.x + 14, deviceRect.y + 16, {
        fontPx: 12,
        material: this.#statusKind === "error" ? this.#errorMaterial : this.#mutedMaterial,
        maxWidthPx: Math.max(1, deviceRect.w - 28),
      })
    }
    this.#renderToolbar(rect.x + 2, toolbarY, Math.max(1, rect.w - 4), ANDROID_TOOLBAR_H)
  }

  #renderToolbar(x: number, y: number, w: number, h: number): void {
    const gap = 6
    const buttonH = 28
    const buttonY = y + Math.max(0, (h - buttonH) / 2)
    const keyButtons = [
      ["A11y", "open-accessibility"],
      ["Chrome", "launch:com.android.chrome"],
      ["Back", "KEYCODE_BACK"],
      ["Home", "KEYCODE_HOME"],
      ["Recent", "KEYCODE_APP_SWITCH"],
      ["Power", "KEYCODE_POWER"],
    ] as const
    const availableW = Math.max(1, w)
    const buttonW = Math.max(42, Math.min(78, Math.floor((availableW - gap * (keyButtons.length - 1)) / keyButtons.length)))
    let buttonX = x
    for (const [label, code] of keyButtons) {
      Button(this, buttonX, buttonY, buttonW, buttonH, {
        label,
        variant: "outlined",
        tone: code === "KEYCODE_POWER" ? "warn" : "neutral",
        fontPx: 11,
        radius: radii.control,
        action: () => {
          if (code === "open-accessibility") this.#onOpenAccessibility?.()
          else if (code.startsWith("launch:")) this.#onLaunchPackage?.(code.slice("launch:".length))
          else this.#onKey?.(code)
        },
      })
      buttonX += buttonW + gap
    }
  }

  #renderGestureOverlay(imageRect: UiSurfaceRect): void {
    const gesture = this.#gesture
    if (gesture === null) return
    const start = this.#devicePointToLocal(gesture.start, imageRect)
    const current = this.#devicePointToLocal(gesture.current, imageRect)
    if (start === null || current === null) return
    this.drawRoundedLine(start.x, start.y, current.x, current.y, palette.cyan, 2, Z.TEXT + 0.04)
    this.drawRoundedRect(start.x - 4, start.y - 4, 8, 8, {
      radius: 4,
      fill: palette.cyan,
      border: null,
      z: Z.TEXT + 0.05,
    })
    this.drawRoundedRect(current.x - 4, current.y - 4, 8, 8, {
      radius: 4,
      fill: palette.text,
      border: null,
      z: Z.TEXT + 0.05,
    })
  }

  #deviceImageRect(deviceRect: UiSurfaceRect): UiSurfaceRect | null {
    const frameW = this.#frame?.width ?? this.#deviceWidth
    const frameH = this.#frame?.height ?? this.#deviceHeight
    if (frameW <= 0 || frameH <= 0) return null
    const pad = 1
    const maxW = Math.max(1, deviceRect.w - pad * 2)
    const maxH = Math.max(1, deviceRect.h - pad * 2)
    const scale = Math.min(maxW / frameW, maxH / frameH)
    const w = Math.max(1, frameW * scale)
    const h = Math.max(1, frameH * scale)
    return {
      x: deviceRect.x + (deviceRect.w - w) / 2,
      y: deviceRect.y + (deviceRect.h - h) / 2,
      w,
      h,
    }
  }

  #deviceShellRect(rect: UiSurfaceRect): UiSurfaceRect {
    const frameW = this.#frame?.width ?? this.#deviceWidth
    const frameH = this.#frame?.height ?? this.#deviceHeight
    if (frameW <= 0 || frameH <= 0) return rect
    const scale = Math.min(rect.w / frameW, rect.h / frameH)
    const w = Math.max(1, frameW * scale)
    const h = Math.max(1, frameH * scale)
    return {
      x: rect.x + (rect.w - w) / 2,
      y: rect.y + (rect.h - h) / 2,
      w,
      h,
    }
  }

  #localPointToDevice(localX: number, localY: number): AndroidPoint | null {
    const rect = this.#lastImageRect
    const frameW = this.#frame?.width ?? this.#deviceWidth
    const frameH = this.#frame?.height ?? this.#deviceHeight
    if (rect === null || frameW <= 0 || frameH <= 0) return null
    if (localX < rect.x || localY < rect.y || localX > rect.x + rect.w || localY > rect.y + rect.h) return null
    return {
      x: clampNumber(((localX - rect.x) / rect.w) * frameW, 0, frameW - 1),
      y: clampNumber(((localY - rect.y) / rect.h) * frameH, 0, frameH - 1),
    }
  }

  #devicePointToLocal(point: AndroidPoint, rect: UiSurfaceRect): AndroidPoint | null {
    const frameW = this.#frame?.width ?? this.#deviceWidth
    const frameH = this.#frame?.height ?? this.#deviceHeight
    if (frameW <= 0 || frameH <= 0) return null
    return {
      x: rect.x + (point.x / frameW) * rect.w,
      y: rect.y + (point.y / frameH) * rect.h,
    }
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: this.#draggable,
      resizable: this.#resizable,
      minW: ANDROID_MIN_W,
      minH: ANDROID_MIN_H,
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
    const canvasElement = this.canvas?.canvas
    if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
    return true
  }

  #updateFrameInteraction(event: MouseEvent): boolean {
    const drag = this.#frameDrag
    const frame = this.canvas?.surfaceFrame(this)
    if (drag === null || frame === undefined || frame === null) return false
    const next = paneFrameDragRect(drag, event, frame.bounds)
    const applied = this.canvas?.setSurfaceRect(this, next)
    if (applied !== undefined && applied !== null) this.#onFrameRectPreview?.(applied)
    const cursor = paneFrameCursor(drag.kind, true)
    const canvasElement = this.canvas?.canvas
    if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
    return true
  }

  #endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    if (this.#frameDrag === null) return false
    this.#updateFrameInteraction(event)
    const frame = this.canvas?.surfaceFrame(this)
    this.#frameDrag = null
    this.#syncFrameCursor(localX, localY)
    if (frame !== undefined && frame !== null) this.#onFrameRectChange?.(frame.rect)
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    this.canvas.canvas.style.cursor = cursor ?? "default"
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    const point = this.#localPointToDevice(localX, localY)
    if (point === null) {
      super.onWheel(event, localX, localY)
      return
    }
    event.preventDefault()
    const dy = event.deltaY
    if (!Number.isFinite(dy) || Math.abs(dy) < 1) return
    const frameH = this.#frame?.height ?? this.#deviceHeight
    const distance = clampNumber(Math.abs(dy) * 3, 48, Math.max(48, frameH * 0.28))
    const y2 = clampNumber(point.y + Math.sign(dy) * distance, 0, Math.max(0, frameH - 1))
    this.#onSwipe?.({
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2,
      durationMs: 180,
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
    if (this.#beginFrameInteraction(event, localX, localY)) return
    const point = this.#localPointToDevice(localX, localY)
    if (point === null) return
    this.canvas?.setFocused(this)
    this.#gesture = {
      start: point,
      current: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startedAt: performance.now(),
    }
    event.preventDefault()
    this.requestRender()
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#updateFrameInteraction(event)) return
    if (this.#gesture !== null) {
      const point = this.#localPointToDevice(localX, localY)
      if (point !== null) this.#gesture.current = point
      event.preventDefault()
      this.requestRender()
      return
    }
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    const gesture = this.#gesture
    if (gesture !== null) {
      const point = this.#localPointToDevice(localX, localY)
      const end = point ?? gesture.current
      this.#gesture = null
      const dx = event.clientX - gesture.startClientX
      const dy = event.clientY - gesture.startClientY
      const durationMs = Math.max(60, Math.min(1000, Math.round(performance.now() - gesture.startedAt)))
      if (Math.hypot(dx, dy) <= ANDROID_GESTURE_TAP_PX) {
        this.#onTap?.(gesture.start.x, gesture.start.y)
      } else {
        this.#onSwipe?.({
          x1: gesture.start.x,
          y1: gesture.start.y,
          x2: end.x,
          y2: end.y,
          durationMs,
        })
      }
      event.preventDefault()
      this.#syncFrameCursor(localX, localY)
      this.requestRender()
      return
    }
    super.onPointerUp(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerLeave(): void {
    if (this.#frameDrag !== null || this.#gesture !== null) return
    super.onPointerLeave()
    const canvasElement = this.canvas?.canvas
    if (canvasElement !== undefined) canvasElement.style.cursor = "default"
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
