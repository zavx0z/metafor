import {Color, TextureLoader} from "@metafor/engine"
import {UiSurface, palette, radii, uiIcons, Z, type UiSurfaceRect} from "@ui/elements"
import {IconButton} from "@ui/components"
import type {AndroidPaneStatusKind} from "@ui/panes"
import type {AndroidRtcFrame, RtcControlCommand} from "./android-rtc.ts"
import {clampNumber, withAlpha} from "./geometry.ts"

const HUD_PANEL_BG = withAlpha(palette.bg, 0.68)
const HUD_CODE_BG = withAlpha(palette.bgCode, 0.62)

type RemoteDesktopPoint = {x: number; y: number}
type RemoteDesktopPointerState = {
  button: string
  buttons: number
  clickCount: number
  point: RemoteDesktopPoint
}

export class RemoteDesktopPane extends UiSurface {
  #statusKind: AndroidPaneStatusKind = "idle"
  #status = "rtc idle"
  #audioStatus = "audio idle"
  #frame: AndroidRtcFrame | null = null
  #visibleFrame: AndroidRtcFrame | null = null
  #lastImageRect: UiSurfaceRect | null = null
  #activePointer: RemoteDesktopPointerState | null = null
  readonly #onRefresh: () => void
  readonly #onInput: (command: RtcControlCommand) => void

  constructor(opts: {onRefresh: () => void; onInput: (command: RtcControlCommand) => void}) {
    super({bgColor: HUD_PANEL_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "RemoteDesktopPane"
    this.#onRefresh = opts.onRefresh
    this.#onInput = opts.onInput
  }

  setStatus(kind: AndroidPaneStatusKind, label: string): void {
    if (this.#statusKind === kind && this.#status === label) return
    this.#statusKind = kind
    this.#status = label
    this.requestRender()
  }

  setAudioStatus(label: string): void {
    if (this.#audioStatus === label) return
    this.#audioStatus = label
    this.requestRender()
  }

  setFrame(frame: AndroidRtcFrame): void {
    if (!isValidRemoteDesktopFrame(frame)) return
    this.#frame = {...frame}
    if (TextureLoader.status(frame.src) === "ready") this.#visibleFrame = this.#frame
    this.requestRender()
  }

  frameSnapshot(): AndroidRtcFrame | null {
    const frame = this.#visibleFrame ?? this.#frame
    return frame === null ? null : {...frame}
  }

  focus(): void {
    this.canvas?.setFocused(this)
  }

  protected render(): void {
    const w = Math.max(360, this.rectW)
    const h = Math.max(240, this.rectH)
    this.drawRoundedRect(0, 0, w, h, {
      radius: radii.pane,
      fill: HUD_PANEL_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.#renderBody({x: 1, y: 1, w: Math.max(1, w - 2), h: Math.max(1, h - 2)})
    this.#renderOverlay(w, h)
  }

  #renderOverlay(w: number, h: number): void {
    const pad = 8
    const buttonSize = 24
    const refreshX = w - pad - buttonSize
    const frame = this.#visibleFrame ?? this.#frame
    const status = this.#statusKind === "error" || frame === null ? this.#status : ""
    if (status.length > 0) {
      const statusMaxW = Math.max(1, refreshX - pad - 8)
      const statusW = Math.min(statusMaxW, Math.max(92, Math.ceil(this.measureText(status, 10)) + 18))
      const statusX = Math.max(pad, refreshX - 8 - statusW)
      this.drawRoundedRect(statusX, pad, statusW, buttonSize, {
        radius: 7,
        fill: new Color(0.04, 0.06, 0.09, 0.76),
        border: this.#statusKind === "error" ? palette.red : palette.borderDim,
        borderWidth: 1,
        z: Z.TEXT,
      })
      this.drawText(status, statusX + 9, pad + 7, {
        fontPx: 10,
        material: this.#statusKind === "error" ? this.materials.red : this.materials.muted,
        maxWidthPx: Math.max(1, statusW - 18),
        z: Z.TEXT + 0.02,
      })
    }
    if (this.#audioStatus !== "audio idle") {
      const audioMaxW = Math.max(1, w - pad * 2)
      const audioW = Math.min(audioMaxW, Math.max(104, Math.ceil(this.measureText(this.#audioStatus, 10)) + 18))
      const audioY = Math.max(pad, h - pad - buttonSize)
      this.drawRoundedRect(pad, audioY, audioW, buttonSize, {
        radius: 7,
        fill: new Color(0.04, 0.06, 0.09, 0.7),
        border: palette.borderDim,
        borderWidth: 1,
        z: Z.TEXT,
      })
      this.drawText(this.#audioStatus, pad + 9, audioY + 7, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, audioW - 18),
        z: Z.TEXT + 0.02,
      })
    }
    IconButton(this, refreshX, 8, buttonSize, buttonSize, {
      label: "Reconnect remote desktop",
      iconSrc: uiIcons.restart,
      fill: new Color(0.04, 0.06, 0.09, 0.58),
      border: palette.borderDim,
      radius: 7,
      action: this.#onRefresh,
    })
  }

  #renderBody(rect: UiSurfaceRect): void {
    this.#syncVisibleFrame()
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: radii.control,
      fill: HUD_CODE_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.ELEMENT - 0.03,
    })
    const frame = this.#visibleFrame ?? this.#frame
    const imageRect = this.#imageRect(rect, frame)
    this.#lastImageRect = imageRect
    if (imageRect !== null && frame !== null) {
      this.drawImage(frame.src, imageRect.x, imageRect.y, imageRect.w, imageRect.h, {
        fit: "contain",
        z: Z.ELEMENT,
      })
      this.#primePendingFrameTexture(rect, frame)
      this.hit(imageRect.x, imageRect.y, imageRect.w, imageRect.h, () => {}, {
        cursor: "crosshair",
        activeCursor: "crosshair",
        key: "remote-desktop-frame",
      })
      return
    }
    this.drawText(this.#statusKind === "error" ? this.#status : "Waiting for desktop stream", rect.x + 14, rect.y + 16, {
      fontPx: 12,
      material: this.#statusKind === "error" ? this.materials.red : this.materials.muted,
      maxWidthPx: Math.max(1, rect.w - 28),
    })
  }

  #syncVisibleFrame(): void {
    const frame = this.#frame
    if (frame !== null && TextureLoader.status(frame.src) === "ready") {
      this.#visibleFrame = frame
    }
  }

  #primePendingFrameTexture(rect: UiSurfaceRect, drawnFrame: AndroidRtcFrame): void {
    const pendingFrame = this.#frame
    if (pendingFrame === null || pendingFrame.src === drawnFrame.src) return
    this.drawImage(pendingFrame.src, rect.x, rect.y, 1, 1, {
      fit: "contain",
      opacity: 0,
      z: Z.ELEMENT + 0.01,
    })
  }

  #imageRect(rect: UiSurfaceRect, frame: AndroidRtcFrame | null): UiSurfaceRect | null {
    if (frame === null || frame.width <= 0 || frame.height <= 0) return null
    const pad = 1
    const maxW = Math.max(1, rect.w - pad * 2)
    const maxH = Math.max(1, rect.h - pad * 2)
    const scale = Math.min(maxW / frame.width, maxH / frame.height)
    const w = Math.max(1, frame.width * scale)
    const h = Math.max(1, frame.height * scale)
    return {
      x: rect.x + (rect.w - w) / 2,
      y: rect.y + (rect.h - h) / 2,
      w,
      h,
    }
  }

  #localPointToFrame(localX: number, localY: number, opts: {clamp?: boolean} = {}): RemoteDesktopPoint | null {
    const rect = this.#lastImageRect
    const frame = this.#visibleFrame ?? this.#frame
    if (rect === null || frame === null) return null
    if (
      opts.clamp !== true &&
      (localX < rect.x || localY < rect.y || localX > rect.x + rect.w || localY > rect.y + rect.h)
    ) {
      return null
    }
    return {
      x: clampNumber(((localX - rect.x) / rect.w) * frame.width, 0, frame.width - 1),
      y: clampNumber(((localY - rect.y) / rect.h) * frame.height, 0, frame.height - 1),
    }
  }

  #withFrameSize(command: RtcControlCommand): RtcControlCommand {
    const frame = this.#visibleFrame ?? this.#frame
    if (frame === null || !("x" in command)) return command
    return {...command, frameW: frame.width, frameH: frame.height} as RtcControlCommand
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) {
      super.onWheel(event, localX, localY)
      return
    }
    event.preventDefault()
    this.#onInput(this.#withFrameSize(remoteDesktopPinchCommand(event, point) ?? {
      type: "wheel",
      x: point.x,
      y: point.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    }))
  }

  onKey(event: KeyboardEvent): void {
    if (event.isComposing) return
    const modifiers = remoteDesktopKeyboardModifiers(event)
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.#onInput({type: "text", text: event.key})
    } else {
      const command = {key: event.key, keyCode: event.code || event.key, modifiers}
      this.#onInput({type: "keyDown", ...command})
      this.#onInput({type: "keyUp", ...command})
    }
    event.preventDefault()
  }

  onInputText(text: string): void {
    if (text.length === 0) return
    this.#onInput({type: "text", text})
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) return
    const button = remoteDesktopMouseButton(event.button)
    const clickCount = Math.max(1, event.detail || 1)
    this.focus()
    this.#activePointer = {
      button,
      buttons: remoteDesktopButtonsMask(button),
      clickCount,
      point,
    }
    this.#onInput({type: "focus"})
    this.#onInput(this.#withFrameSize({
      type: "pointerDown",
      x: point.x,
      y: point.y,
      button,
      buttons: remoteDesktopButtonsMask(button),
      clickCount,
    }))
    event.preventDefault()
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const active = this.#activePointer
    if (active === null) {
      const point = this.#localPointToFrame(localX, localY)
      if (point === null) {
        super.onPointerMove(event, localX, localY)
        return
      }
      this.#onInput(this.#withFrameSize({
        type: "pointerMove",
        x: point.x,
        y: point.y,
        buttons: 0,
      }))
      event.preventDefault()
      return
    }
    const point = this.#localPointToFrame(localX, localY, {clamp: true})
    if (point === null) return
    active.point = point
    this.#onInput(this.#withFrameSize({
      type: "pointerMove",
      x: point.x,
      y: point.y,
      button: active.button,
      buttons: active.buttons,
    }))
    event.preventDefault()
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    const active = this.#activePointer
    this.#activePointer = null
    const point = this.#localPointToFrame(localX, localY, {clamp: active !== null}) ?? active?.point ?? null
    if (active !== null && point !== null) {
      super.onPointerUp(event, localX, localY)
      this.#onInput(this.#withFrameSize({
        type: "pointerUp",
        x: point.x,
        y: point.y,
        button: active.button,
        buttons: 0,
        clickCount: active.clickCount,
      }))
      event.preventDefault()
      return
    }
    super.onPointerUp(event, localX, localY)
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) {
      super.onContextMenu(event, localX, localY)
      return
    }
    event.preventDefault()
  }
}

export function isValidRemoteDesktopFrame(frame: AndroidRtcFrame): boolean {
  return frame.width > 0 && frame.height > 0
}

function remoteDesktopPinchCommand(event: WheelEvent, point: RemoteDesktopPoint): RtcControlCommand | null {
  if (!remoteDesktopWheelIsPinch(event)) return null
  const deltaX = remoteDesktopWheelDeltaPx(event.deltaX, event.deltaMode)
  const deltaY = remoteDesktopPinchDeltaY(event)
  return {
    type: "pinch",
    x: point.x,
    y: point.y,
    deltaX,
    deltaY,
    deltaMode: 0,
    scale: remoteDesktopPinchScale(deltaY),
    ctrlKey: event.ctrlKey,
  }
}

function remoteDesktopWheelIsPinch(event: WheelEvent): boolean {
  return event.ctrlKey
}

function remoteDesktopPinchDeltaY(event: WheelEvent): number {
  const deltaY = remoteDesktopWheelDeltaPx(event.deltaY, event.deltaMode)
  if (Math.abs(deltaY) >= 0.01) return deltaY
  return remoteDesktopWheelDeltaPx(event.deltaX, event.deltaMode)
}

function remoteDesktopWheelDeltaPx(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0
  if (deltaMode === 1) return delta * 40
  if (deltaMode === 2) return delta * 800
  return delta
}

function remoteDesktopPinchScale(deltaY: number): number {
  return clampNumber(Math.exp(-deltaY / 100), 0.1, 10)
}

function remoteDesktopKeyboardModifiers(event: KeyboardEvent): string[] {
  const modifiers: string[] = []
  if (event.altKey) modifiers.push("alt")
  if (event.ctrlKey) modifiers.push("control")
  if (event.metaKey) modifiers.push("meta")
  if (event.shiftKey) modifiers.push("shift")
  return modifiers
}

function remoteDesktopMouseButton(button: number): string {
  if (button === 1) return "middle"
  if (button === 2) return "right"
  return "left"
}

function remoteDesktopButtonsMask(button: string): number {
  if (button === "right") return 2
  if (button === "middle") return 4
  return 1
}
