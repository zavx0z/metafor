import {Color} from "@metafor/engine"
import {UiSurface, palette, Z, type UiSurfaceRect} from "@ui/elements"
import {HudWindow} from "@ui/hud"
import {
  PANE_FRAME,
  beginPaneFrameDrag,
  paneBodyRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
} from "@ui/panes"

export type BrowserChatPaneMessage = {
  role: "user" | "assistant" | "system"
  text: string
  streaming?: boolean
}

export type BrowserChatPaneOptions = {
  messages(): readonly BrowserChatPaneMessage[]
  status(): string
  setDocked(docked: boolean): void
  clampRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect
  storeRect(rect: UiSurfaceRect): void
}

export const BROWSER_CHAT_PANE_MIN_W = 420
export const BROWSER_CHAT_PANE_MIN_H = 260
export const BROWSER_CHAT_PANE_DEFAULT_W = 620
export const BROWSER_CHAT_PANE_DEFAULT_H = 430
export const BROWSER_CHAT_PANE_GAP = 8

const MESSAGE_FONT = 11
const MESSAGE_LINE_H = 16
const MESSAGE_PAD = 10
const MESSAGE_GAP = 8

type RenderLine = {
  role: BrowserChatPaneMessage["role"]
  text: string
  first: boolean
  streaming: boolean
}

export class BrowserChatPane extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null
  readonly #opts: BrowserChatPaneOptions

  constructor(opts: BrowserChatPaneOptions) {
    super({bgColor: null, borderColor: null})
    this.node.name = "InterpreterBrowserChatPane"
    this.#opts = opts
  }

  protected render(): void {
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    HudWindow(this, 0, 0, w, h, {
      title: "Browser Agent Chat",
      subtitle: this.#opts.status(),
      onMinimize: () => this.#opts.setDocked(true),
      minimizeLabel: "Dock Browser Agent",
      active: this.active,
      fill: new Color(0.035, 0.055, 0.06, 0.58),
      border: this.active ? palette.windowActiveBorder : palette.borderDim,
      height: PANE_FRAME.headerHeight,
      ruleColor: palette.borderDim,
      bodyInsetX: PANE_FRAME.bodyInsetX,
      bodyTopGap: PANE_FRAME.bodyTopGap,
      bodyBottomInset: PANE_FRAME.bodyInsetX,
    })
    const body = paneBodyRect(w, h, {
      headerHeight: PANE_FRAME.headerHeight,
      insetX: PANE_FRAME.bodyInsetX,
      topGap: PANE_FRAME.bodyTopGap,
      bottomInset: PANE_FRAME.bodyInsetX,
    })
    this.#renderMessages(body)
  }

  #renderMessages(body: UiSurfaceRect): void {
    const rows = this.#messageRows(Math.max(80, body.w - MESSAGE_PAD * 2))
    if (rows.length === 0) {
      this.drawText("No browser chat messages yet", body.x + 8, body.y + 8, {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, body.w - 16),
        z: Z.TEXT,
      })
      return
    }

    const contentH = rows.reduce((sum, block) => sum + block.length * MESSAGE_LINE_H + MESSAGE_PAD * 2 + MESSAGE_GAP, 0)
    let y = body.y + Math.min(0, body.h - contentH)
    for (const block of rows) {
      const blockH = block.length * MESSAGE_LINE_H + MESSAGE_PAD * 2
      if (y + blockH >= body.y && y <= body.y + body.h) this.#drawMessageBlock(block, body.x, y, body.w, blockH)
      y += blockH + MESSAGE_GAP
    }
  }

  #messageRows(maxTextW: number): RenderLine[][] {
    return this.#opts.messages().map((message) => {
      const lines = wrapText(this, message.text, maxTextW, MESSAGE_FONT)
      return lines.map((line, index) => ({
        role: message.role,
        text: line,
        first: index === 0,
        streaming: message.streaming === true,
      }))
    })
  }

  #drawMessageBlock(block: readonly RenderLine[], x: number, y: number, w: number, h: number): void {
    const role = block[0]?.role ?? "system"
    const streaming = block.some((line) => line.streaming)
    const fill = role === "user"
      ? new Color(0.07, 0.11, 0.16, 0.72)
      : role === "assistant"
        ? new Color(0.045, 0.095, 0.09, 0.72)
        : new Color(0.08, 0.08, 0.085, 0.6)
    const border = streaming ? palette.cyan : palette.borderDim
    this.drawRoundedRect(x, y, w, h, {radius: 10, fill, border, borderWidth: streaming ? 1.2 : 1, z: Z.CONTAINER})

    let cy = y + MESSAGE_PAD
    for (const line of block) {
      const label = line.first ? `${messageRoleLabel(role)}: ` : ""
      const labelW = label.length === 0 ? 0 : this.drawText(label, x + MESSAGE_PAD, cy, {
        fontPx: MESSAGE_FONT,
        material: role === "assistant" ? this.materials.cyan : role === "user" ? this.materials.text : this.materials.muted,
        maxWidthPx: 80,
        z: Z.TEXT,
      })
      this.drawText(line.text, x + MESSAGE_PAD + labelW, cy, {
        fontPx: MESSAGE_FONT,
        material: role === "system" ? this.materials.muted : this.materials.text,
        maxWidthPx: Math.max(1, w - MESSAGE_PAD * 2 - labelW),
        z: Z.TEXT,
      })
      cy += MESSAGE_LINE_H
    }
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: true,
      resizable: true,
      minW: BROWSER_CHAT_PANE_MIN_W,
      minH: BROWSER_CHAT_PANE_MIN_H,
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
    const next = this.#opts.clampRect(paneFrameDragRect(drag, event, frame.bounds), frame.bounds.w, frame.bounds.h)
    this.canvas?.setSurfaceRect(this, next)
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
    if (frame !== undefined && frame !== null) {
      this.#opts.storeRect(frame.rect)
      this.canvas?.clearSurfaceRect(this)
      this.canvas?.relayout()
    }
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    if (this.canvas.canvas !== undefined) this.canvas.canvas.style.cursor = cursor ?? "default"
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null) return
    this.#beginFrameInteraction(event, localX, localY)
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#updateFrameInteraction(event)) return
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerLeave(): void {
    if (this.#frameDrag !== null) return
    super.onPointerLeave()
  }

  override onDeactivate(): void {
    this.#frameDrag = null
    super.onDeactivate()
  }
}

function messageRoleLabel(role: BrowserChatPaneMessage["role"]): string {
  if (role === "user") return "You"
  if (role === "assistant") return "Qwen"
  return "Status"
}

function wrapText(surface: UiSurface, text: string, maxW: number, fontPx: number): string[] {
  const out: string[] = []
  for (const sourceLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = sourceLine.length === 0 ? [""] : sourceLine.split(/\s+/g)
    let line = ""
    for (const word of words) {
      const next = line.length === 0 ? word : `${line} ${word}`
      if (surface.measureText(next, fontPx) <= maxW) {
        line = next
        continue
      }
      if (line.length > 0) out.push(line)
      line = word
      while (surface.measureText(line, fontPx) > maxW && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && surface.measureText(line.slice(0, cut), fontPx) > maxW) cut -= 1
        out.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    out.push(line)
  }
  return out.length === 0 ? [""] : out
}
