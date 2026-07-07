import {Color} from "@metafor/engine"
import {UiSurface, flexColumn, palette, uiIcons, Z, type UiSurfaceRect} from "@ui/elements"
import {ButtonVoice, type ButtonVoiceSnapshot} from "@ui/components"
import {HudWindow, type HudWindowTitleBarAction} from "@ui/hud"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  formatCodexAttachmentSize,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  type CodexComposerAttachment,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
} from "@ui/panes"
import {pointInUiRect} from "./geometry.ts"

export const HOST_TERMINAL_CODEX_COMPOSER_H = 268
export const HOST_TERMINAL_CODEX_COMPOSER_MIN_W = 420
export const HOST_TERMINAL_CODEX_COMPOSER_MIN_H = 220
export const HOST_TERMINAL_CODEX_COMPOSER_GAP = 8
export const HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE = 24
export const HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE = true

const VOICE_SETTINGS_LONG_PRESS_MS = 450
const VOICE_SETTINGS_LONG_PRESS_MOVE_PX = 6
const VOICE_TOGGLE_CLICK_DELAY_MS = 320

export type HostCodexComposerController = {
  codexAttachments: CodexComposerAttachment[]
  codexDropActive: boolean
}

export type HostCodexComposerPaneOptions<T extends HostCodexComposerController> = {
  controller: T
  title?: string
  minimizeLabel?: string
  voiceKey?: string
  nodeName?: string
  leftActions?(controller: T): readonly HudWindowTitleBarAction[]
  status(controller: T): string
  canSubmit(controller: T): boolean
  submit(controller: T): void
  chooseImages(controller: T): void
  setDocked(docked: boolean): void
  voiceSnapshot(): ButtonVoiceSnapshot
  voiceSoundPulse(): number
  onVoiceToggle(controller: T): void
  openVoiceSettings(): void
  removeAttachment(controller: T, id: string): void
  clampRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect
  syncEditorToComposer(controller: T, composer: UiSurfaceRect, mode: "drag" | "release"): void
  storeRect(rect: UiSurfaceRect): void
  isAndroidBrowser(): boolean
  isTouchPointerEvent(event: MouseEvent): boolean
}

export class HostTerminalCodexComposerPane<T extends HostCodexComposerController> extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null
  #voiceSettingsPressTimer: number | null = null
  #voiceSettingsPressStart: {x: number; y: number} | null = null
  #voiceSettingsLongPressOpened = false
  #voiceToggleClickTimer: number | null = null
  readonly #opts: HostCodexComposerPaneOptions<T>

  constructor(opts: HostCodexComposerPaneOptions<T>) {
    super({bgColor: null, borderColor: null})
    this.node.name = opts.nodeName ?? "InterpreterHostCodexComposerPane"
    this.#opts = opts
  }

  protected render(): void {
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    this.#renderWindow(w, h)
    const layout = hostCodexComposerContentLayout(w, h, this.#opts.controller.codexAttachments.length > 0)
    if (layout.attachments !== null) this.#drawAttachmentRow(layout.attachments.x, layout.attachments.y, layout.attachments.w, layout.attachments.y + layout.attachments.h)
    if (this.#opts.controller.codexDropActive) this.#drawDropOverlay(w, h)
  }

  #renderWindow(w: number, h: number): void {
    const buttonSize = HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE
    const status = this.#opts.status(this.#opts.controller)
    const leftActions = this.#opts.leftActions?.(this.#opts.controller) ?? []
    const rightActions: HudWindowTitleBarAction[] = [
      {
        label: "Отправить",
        iconSrc: uiIcons.send,
        disabled: !this.#opts.canSubmit(this.#opts.controller),
        action: () => this.#opts.submit(this.#opts.controller),
        width: buttonSize,
      },
      {
        label: "Прикрепить изображение",
        iconSrc: uiIcons.image,
        action: () => this.#opts.chooseImages(this.#opts.controller),
        width: buttonSize,
      },
    ]
    if (HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE) {
      rightActions.push({
        label: "Голосовой ввод",
        width: buttonSize,
        render: (rect) => ButtonVoice(this, rect.x, rect.y, rect.w, {
          key: this.#opts.voiceKey ?? "interpreter-codex-message-voice",
          snapshot: this.#opts.voiceSnapshot(),
          soundPulse: this.#opts.voiceSoundPulse(),
          tooltip: "Голосовой ввод",
          onClick: () => this.#queueVoiceToggleClick(),
        }),
      })
    }
    HudWindow(this, 0, 0, w, h, {
      title: this.#opts.title ?? "Codex message",
      subtitle: status,
      onMinimize: () => this.#opts.setDocked(true),
      minimizeLabel: this.#opts.minimizeLabel ?? "Свернуть Codex",
      leftActions,
      rightActions,
      active: this.active,
      fill: new Color(0.04, 0.06, 0.09, 0.52),
      border: this.#opts.controller.codexDropActive ? palette.cyan : this.active ? palette.windowActiveBorder : palette.borderDim,
      borderWidth: this.#opts.controller.codexDropActive ? 1.3 : 1,
      height: PANE_FRAME.headerHeight,
      buttonSize,
      buttonGap: 5,
      ruleColor: palette.borderDim,
      bodyInsetX: PANE_FRAME.bodyInsetX,
      bodyTopGap: PANE_FRAME.bodyTopGap,
      bodyBottomInset: PANE_FRAME.bodyInsetX,
    })
  }

  #voiceButtonRect(w = Math.max(1, this.rectW)): UiSurfaceRect {
    const buttonSize = HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE
    return {
      x: w - PANE_FRAME.headerTextX - buttonSize,
      y: 6,
      w: buttonSize,
      h: buttonSize,
    }
  }

  #voiceButtonHit(localX: number, localY: number): boolean {
    if (!HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE) return false
    return pointInUiRect(localX, localY, this.#voiceButtonRect())
  }

  #beginVoiceSettingsLongPress(localX: number, localY: number): void {
    this.#cancelVoiceSettingsLongPress()
    this.#voiceSettingsPressStart = {x: localX, y: localY}
    this.#voiceSettingsLongPressOpened = false
    this.#voiceSettingsPressTimer = window.setTimeout(() => {
      this.#voiceSettingsPressTimer = null
      if (this.#voiceSettingsPressStart === null) return
      this.#cancelVoiceToggleClick()
      this.#voiceSettingsLongPressOpened = true
      this.#opts.openVoiceSettings()
      super.onDeactivate()
    }, VOICE_SETTINGS_LONG_PRESS_MS)
  }

  #cancelVoiceSettingsLongPress(): void {
    if (this.#voiceSettingsPressTimer !== null) {
      window.clearTimeout(this.#voiceSettingsPressTimer)
      this.#voiceSettingsPressTimer = null
    }
    this.#voiceSettingsPressStart = null
  }

  #openVoiceSettingsFromButton(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.#cancelVoiceToggleClick()
    this.#cancelVoiceSettingsLongPress()
    this.#voiceSettingsLongPressOpened = false
    this.#opts.openVoiceSettings()
    super.onDeactivate()
  }

  #queueVoiceToggleClick(): void {
    this.#cancelVoiceToggleClick()
    this.#voiceToggleClickTimer = window.setTimeout(() => {
      this.#voiceToggleClickTimer = null
      this.#opts.onVoiceToggle(this.#opts.controller)
    }, VOICE_TOGGLE_CLICK_DELAY_MS)
  }

  #cancelVoiceToggleClick(): void {
    if (this.#voiceToggleClickTimer === null) return
    window.clearTimeout(this.#voiceToggleClickTimer)
    this.#voiceToggleClickTimer = null
  }

  #drawAttachmentRow(x: number, y: number, w: number, maxY: number): void {
    let cx = x
    let cy = y
    const gap = 6
    const chipH = 22
    for (const attachment of this.#opts.controller.codexAttachments) {
      if (cy + chipH > maxY - 18) break
      const label = `${attachment.name} · ${formatCodexAttachmentSize(attachment.size)}`
      const chipW = Math.min(w, Math.max(96, Math.ceil(this.measureText(label, 10)) + 34))
      if (cx > x && cx + chipW > x + w) {
        cx = x
        cy += chipH + gap
        if (cy + chipH > maxY - 18) break
      }
      this.drawRoundedRect(cx, cy, chipW, chipH, {
        radius: 7,
        fill: new Color(0.06, 0.12, 0.15, 0.72),
        border: palette.borderDim,
        borderWidth: 1,
        z: Z.ELEMENT,
      })
      this.drawText(label, cx + 9, cy + 5, {
        fontPx: 10,
        material: this.materials.text,
        maxWidthPx: Math.max(1, chipW - 28),
        z: Z.TEXT,
      })
      this.drawText("x", cx + chipW - 16, cy + 5, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: 8,
        z: Z.TEXT,
      })
      this.hit(cx, cy, chipW, chipH, () => this.#opts.removeAttachment(this.#opts.controller, attachment.id), {
        key: `interpreter-codex-attachment:${attachment.id}`,
        cursor: "pointer",
      })
      cx += chipW + gap
    }
  }

  #drawDropOverlay(w: number, h: number): void {
    this.drawRect(0, PANE_FRAME.headerHeight, w, Math.max(1, h - PANE_FRAME.headerHeight), new Color(0.02, 0.16, 0.18, 0.26), Z.CONTAINER + 0.2)
    this.drawText("Drop image", 2, h - 22, {
      fontPx: 11,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, w - 4),
      z: Z.TEXT + 0.2,
    })
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: true,
      resizable: true,
      minW: HOST_TERMINAL_CODEX_COMPOSER_MIN_W,
      minH: HOST_TERMINAL_CODEX_COMPOSER_MIN_H,
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
    const next = this.#opts.clampRect(paneFrameDragRect(drag, event, frame.bounds), frame.bounds.w, frame.bounds.h)
    const applied = this.canvas?.setSurfaceRect(this, next) ?? next
    this.#opts.syncEditorToComposer(this.#opts.controller, applied, "drag")
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
    if (frame !== undefined && frame !== null) {
      this.#opts.storeRect(frame.rect)
      this.canvas?.clearSurfaceRect(this)
      this.#opts.syncEditorToComposer(this.#opts.controller, frame.rect, "release")
    }
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    const canvasElement = this.canvas.canvas
    if (canvasElement !== undefined) canvasElement.style.cursor = cursor ?? "default"
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    if (this.#voiceButtonHit(localX, localY)) {
      if (event.button === 0 && event.detail >= 2) {
        this.#openVoiceSettingsFromButton(event)
        return
      }
      if (event.button === 2 || (event.ctrlKey && event.button === 0)) {
        this.#openVoiceSettingsFromButton(event)
        return
      }
      if (event.button === 0 && (this.#opts.isAndroidBrowser() || this.#opts.isTouchPointerEvent(event))) this.#beginVoiceSettingsLongPress(localX, localY)
    }
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
    this.#beginFrameInteraction(event, localX, localY)
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const voicePressStart = this.#voiceSettingsPressStart
    if (voicePressStart !== null && Math.hypot(localX - voicePressStart.x, localY - voicePressStart.y) > VOICE_SETTINGS_LONG_PRESS_MOVE_PX) {
      this.#cancelVoiceSettingsLongPress()
    }
    if (this.#updateFrameInteraction(event)) return
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#voiceSettingsLongPressOpened) {
      this.#voiceSettingsLongPressOpened = false
      this.#cancelVoiceSettingsLongPress()
      event.preventDefault()
      this.#syncFrameCursor(localX, localY)
      return
    }
    this.#cancelVoiceSettingsLongPress()
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    if (this.#voiceButtonHit(localX, localY)) {
      this.#openVoiceSettingsFromButton(event)
      return
    }
    super.onContextMenu(event, localX, localY)
  }

  override onPointerLeave(): void {
    if (this.#frameDrag !== null) return
    this.#cancelVoiceSettingsLongPress()
    super.onPointerLeave()
  }

  override onDeactivate(): void {
    this.#frameDrag = null
    this.#cancelVoiceSettingsLongPress()
    this.#cancelVoiceToggleClick()
    this.#voiceSettingsLongPressOpened = false
    super.onDeactivate()
  }
}

export type HostCodexComposerContentLayout = {
  editor: UiSurfaceRect
  attachments: UiSurfaceRect | null
}

export function hostCodexComposerContentLayout(w: number, h: number, hasAttachments: boolean): HostCodexComposerContentLayout {
  const body = paneBodyRect(w, h, {
    headerHeight: PANE_FRAME.headerHeight,
    insetX: PANE_FRAME.bodyInsetX,
    topGap: PANE_FRAME.bodyTopGap,
    bottomInset: PANE_FRAME.bodyInsetX,
  })
  const layout: HostCodexComposerContentLayout = {
    editor: {...body},
    attachments: null,
  }
  flexColumn({
    x: body.x,
    y: body.y,
    w: body.w,
    h: body.h,
    gap: hasAttachments ? 8 : 0,
    items: [
      {height: "grow", draw: (x, y, width, height) => { layout.editor = {x, y, w: Math.max(1, width), h: Math.max(1, height)} }},
      hasAttachments && {height: 30, draw: (x, y, width, height) => { layout.attachments = {x, y, w: Math.max(1, width), h: Math.max(1, height)} }},
    ],
  })
  return layout
}
