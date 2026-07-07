import {Color} from "@metafor/engine"
import {IconButton} from "@ui/components"
import {UiSurface, div, divScrollPosition, divScrollTo, flexRow, palette, uiIcons, Z, type DivScrollContext, type UiSurfaceRect} from "@ui/elements"
import {HudWindow, type HudWindowTitleBarAction} from "@ui/hud"
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
  label?: string
  streaming?: boolean
}

export type BrowserChatPaneStatusKind = "ready" | "sending" | "thinking" | "tools" | "blocked" | "error"
export type BrowserChatPaneToolPromptMode = "fast" | "expert" | "vision"

export type BrowserChatPaneSession = {
  id: string
  label: string
  provider: "qwen" | "deepseek"
  status: string
  statusKind: BrowserChatPaneStatusKind
  unread?: boolean
}

export type BrowserChatPaneOptions = {
  messages(): readonly BrowserChatPaneMessage[]
  sessions(): readonly BrowserChatPaneSession[]
  activeSessionId(): string
  activateSession(id: string): void
  status(): string
  statusKind(): BrowserChatPaneStatusKind
  toolPromptMode(): BrowserChatPaneToolPromptMode | null
  setToolPromptMode(mode: BrowserChatPaneToolPromptMode): void
  deepThinking(): boolean | null
  toggleDeepThinking(): void
  canSendToolPrompt(): boolean
  sendToolPrompt(): void
  paused(): boolean
  stopped(): boolean
  pause(): void
  resume(): void
  stop(): void
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
const TAB_ROW_H = 30
const TAB_ROW_GAP = 8
const CONTROL_TOOLBAR_H = 34
const CONTROL_TOOLBAR_GAP = 6
const BROWSER_CHAT_SCROLL_KEY = "interpreter:browser-chat:messages"

type RenderBlock = {
  role: BrowserChatPaneMessage["role"]
  label: string
  lines: string[]
  top: number
  height: number
  streaming: boolean
}

export class BrowserChatPane extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null
  readonly #opts: BrowserChatPaneOptions
  #lastMessageKey = ""
  #lastContentH = 0

  constructor(opts: BrowserChatPaneOptions) {
    super({bgColor: null, borderColor: null})
    this.node.name = "InterpreterBrowserChatPane"
    this.#opts = opts
  }

  protected render(): void {
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    const status = this.#opts.status()
    const statusKind = this.#opts.statusKind()
    HudWindow(this, 0, 0, w, h, {
      title: "Browser Agent Chat",
      onMinimize: () => this.#opts.setDocked(true),
      minimizeLabel: "Dock Browser Agent",
      rightActions: this.#titleBarActions(),
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
    const toolbarH = Math.min(CONTROL_TOOLBAR_H, Math.max(0, body.h - 80))
    const toolbarGap = toolbarH > 0 ? CONTROL_TOOLBAR_GAP : 0
    const tabsH = Math.min(TAB_ROW_H, Math.max(0, body.h - toolbarH - toolbarGap - 80))
    const tabsGap = tabsH > 0 ? TAB_ROW_GAP : 0
    if (tabsH > 0) this.#renderTabs({x: body.x, y: body.y, w: body.w, h: tabsH})
    this.#renderMessages({
      x: body.x,
      y: body.y + tabsH + tabsGap,
      w: body.w,
      h: Math.max(1, body.h - tabsH - tabsGap - toolbarH - toolbarGap),
    })
    if (toolbarH > 0) this.#renderControlToolbar({x: body.x, y: body.y + body.h - toolbarH, w: body.w, h: toolbarH}, status, statusKind)
  }

  #titleBarActions(): HudWindowTitleBarAction[] {
    const mode = this.#opts.toolPromptMode()
    const actions: HudWindowTitleBarAction[] = [
      {
        label: "New Agent Chat Prompt",
        iconSrc: uiIcons.codex,
        tooltip: "New chat with tools prompt",
        active: true,
        disabled: !this.#opts.canSendToolPrompt(),
        action: () => this.#opts.sendToolPrompt(),
      },
    ]
    if (mode !== null) {
      actions.push({
        label: "DeepSeek Fast",
        iconSrc: uiIcons.fast,
        tooltip: "DeepSeek Fast",
        active: mode === "fast",
        action: () => this.#opts.setToolPromptMode("fast"),
      }, {
        label: "DeepSeek Expert",
        iconSrc: uiIcons.expert,
        tooltip: "DeepSeek Expert",
        active: mode === "expert",
        action: () => this.#opts.setToolPromptMode("expert"),
      }, {
        label: "DeepSeek Recognition",
        iconSrc: uiIcons.recognition,
        tooltip: "DeepSeek Recognition",
        active: mode === "vision",
        action: () => this.#opts.setToolPromptMode("vision"),
      })
    }
    return actions
  }

  #renderTabs(rect: UiSurfaceRect): void {
    const sessions = this.#opts.sessions()
    if (sessions.length === 0) return
    const activeId = this.#opts.activeSessionId()
    let x = rect.x
    const gap = 6
    for (const session of sessions) {
      const tabW = Math.min(Math.max(92, Math.ceil(this.measureText(session.label, 10) + 36)), Math.max(72, rect.x + rect.w - x))
      const active = session.id === activeId
      const kind = session.statusKind
      const tone = kind === "ready" ? palette.green
        : kind === "error" ? palette.red
          : kind === "blocked" ? palette.orange
            : palette.cyan
      const fill = active ? new Color(0.055, 0.105, 0.12, 0.82) : new Color(0.03, 0.045, 0.05, 0.58)
      const border = active ? tone : palette.borderDim
      this.drawRoundedRect(x, rect.y + 2, tabW, Math.max(1, rect.h - 4), {
        radius: 9,
        fill,
        border,
        borderWidth: active ? 1.2 : 1,
        z: Z.CONTAINER + 0.03,
      })
      this.drawRoundedRect(x + 10, rect.y + rect.h / 2 - 3, 6, 6, {
        radius: 3,
        fill: tone,
        border: null,
        z: Z.TEXT,
      })
      this.drawText(session.label, x + 24, rect.y + 9, {
        fontPx: 10,
        material: active ? this.materials.text : this.materials.muted,
        maxWidthPx: Math.max(1, tabW - 32),
        z: Z.TEXT,
      })
      if (session.unread === true) {
        this.drawRoundedRect(x + tabW - 13, rect.y + 7, 6, 6, {radius: 3, fill: palette.cyan, border: null, z: Z.TEXT})
      }
      this.hit(x, rect.y + 2, tabW, Math.max(1, rect.h - 4), () => this.#opts.activateSession(session.id), {
        key: `browser-chat-tab:${session.id}`,
        cursor: "pointer",
      })
      x += tabW + gap
      if (x >= rect.x + rect.w - 48) break
    }
  }

  #drawStatusBadge(rect: UiSurfaceRect, label: string, kind: BrowserChatPaneStatusKind): void {
    const tone = kind === "ready" ? palette.green
      : kind === "error" ? palette.red
        : kind === "blocked" ? palette.orange
          : palette.cyan
    const fill = kind === "ready" ? new Color(0.05, 0.13, 0.08, 0.72)
      : kind === "error" ? new Color(0.16, 0.055, 0.045, 0.74)
        : kind === "blocked" ? new Color(0.16, 0.11, 0.045, 0.74)
          : new Color(0.045, 0.095, 0.13, 0.74)
    const material = kind === "ready" ? this.materials.green
      : kind === "error" ? this.materials.red
        : kind === "blocked" ? this.materials.orange
          : this.materials.cyan
    const y = rect.y + 2
    const h = Math.max(1, rect.h - 4)
    const fontPx = 10
    const labelW = Math.min(this.measureText(label, fontPx), Math.max(1, rect.w - 30))
    this.drawRoundedRect(rect.x, y, rect.w, h, {radius: 8, fill, border: tone, borderWidth: 1, z: Z.CONTAINER + 0.04})
    flexRow({
      x: rect.x,
      y,
      w: rect.w,
      h,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      items: [
        {width: 6, height: 6, draw: (dotX, dotY, dotW, dotH) => {
          this.drawRoundedRect(dotX, dotY, dotW, dotH, {radius: 3, fill: tone, border: null, z: Z.TEXT})
        }},
        {width: labelW, height: fontPx, draw: (textX, textY, textW, textH) => {
          this.drawTextCentered(label, textX + textW / 2, textY + textH / 2, {
            fontPx,
            material,
            maxWidthPx: textW,
            z: Z.TEXT,
          })
        }},
      ],
    })
  }

  #renderControlToolbar(rect: UiSurfaceRect, status: string, kind: BrowserChatPaneStatusKind): void {
    const buttonSize = 22
    const gap = 5
    const deepThinking = this.#opts.deepThinking()
    const deepW = deepThinking === null ? 0 : 58
    const controlsFixedW = buttonSize * 3 + deepW
    const controlsGapW = gap * (deepThinking === null ? 3 : 4)
    const statusW = Math.max(82, Math.min(Math.ceil(this.measureText(status, 10) + 32), Math.max(82, rect.w - 16 - controlsFixedW - controlsGapW - 18)))
    const paused = this.#opts.paused()
    const stopped = this.#opts.stopped()
    this.drawRect(rect.x, rect.y, rect.w, 1, palette.borderDim, Z.SEPARATOR)
    this.drawRoundedRect(rect.x, rect.y + 4, rect.w, Math.max(1, rect.h - 4), {
      radius: 10,
      fill: new Color(0.025, 0.04, 0.045, 0.48),
      border: null,
      z: Z.CONTAINER + 0.01,
    })
    flexRow({
      x: rect.x + 8,
      y: rect.y + 4,
      w: Math.max(1, rect.w - 16),
      h: Math.max(1, rect.h - 4),
      alignItems: "center",
      gap,
      items: [
        {width: statusW, height: buttonSize, draw: (x, y, w, h) => this.#drawStatusBadge({x, y, w, h}, status, kind)},
        {width: "grow", height: 0, draw: () => {}},
        deepThinking !== null && {width: deepW, height: buttonSize, draw: (x, y, w, h) => this.#drawDeepThinkingToggle({x, y, w, h}, deepThinking)},
        {width: buttonSize, height: buttonSize, draw: (x, y, w, h) => {
          IconButton(this, x, y, w, h, {
            label: "Pause Browser Agent",
            iconSrc: uiIcons.pause,
            tooltip: "Pause Browser Agent",
            tone: "paused",
            variant: paused ? "contained" : "text",
            disabled: paused || stopped,
            radius: 7,
            action: () => this.#opts.pause(),
          })
        }},
        {width: buttonSize, height: buttonSize, draw: (x, y, w, h) => {
          IconButton(this, x, y, w, h, {
            label: "Resume Browser Agent",
            iconSrc: uiIcons.run,
            tooltip: "Resume Browser Agent",
            tone: "live",
            variant: !paused && !stopped ? "contained" : "text",
            disabled: !paused,
            radius: 7,
            action: () => this.#opts.resume(),
          })
        }},
        {width: buttonSize, height: buttonSize, draw: (x, y, w, h) => {
          IconButton(this, x, y, w, h, {
            label: "Stop Browser Agent",
            iconSrc: uiIcons.stop,
            tooltip: "Stop Browser Agent",
            tone: "warn",
            variant: stopped ? "contained" : "text",
            disabled: stopped,
            radius: 7,
            action: () => this.#opts.stop(),
          })
        }},
      ],
    })
  }

  #drawDeepThinkingToggle(rect: UiSurfaceRect, active: boolean): void {
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: 8,
      fill: active ? palette.liveFill : palette.bgPanelDim,
      border: active ? palette.cyan : palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER + 0.04,
    })
    this.drawTextCentered("Deep", rect.x + rect.w / 2, rect.y + rect.h / 2, {
      fontPx: 10,
      material: active ? this.materials.cyan : this.materials.muted,
      maxWidthPx: Math.max(1, rect.w - 10),
      z: Z.TEXT,
    })
    this.hit(rect.x, rect.y, rect.w, rect.h, () => this.#opts.toggleDeepThinking(), {
      key: "browser-chat-deep-thinking",
      cursor: "pointer",
      tooltip: {label: active ? "DeepSeek deep thinking on" : "DeepSeek deep thinking off", delayMs: 450},
    })
  }

  #renderMessages(body: UiSurfaceRect): void {
    const layout = this.#messageLayout(Math.max(80, body.w - MESSAGE_PAD * 2 - 8))
    if (layout.blocks.length === 0) {
      this.drawText("No browser chat messages yet", body.x + 8, body.y + 8, {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, body.w - 16),
        z: Z.TEXT,
      })
      return
    }

    const contentH = Math.max(body.h, layout.contentH)
    const messageKey = this.#messageKey()
    const scrollKey = this.#scrollKey()
    const scroll = divScrollPosition(this, scrollKey)
    const wasAtBottom = this.#lastContentH <= body.h || scroll.top >= Math.max(0, this.#lastContentH - body.h - 12)
    if (messageKey !== this.#lastMessageKey && (this.#lastMessageKey.length === 0 || wasAtBottom)) {
      divScrollTo(this, scrollKey, {top: Math.max(0, contentH - body.h)})
    }
    this.#lastMessageKey = messageKey
    this.#lastContentH = contentH

    div(this, body.x, body.y, body.w, body.h, {
      key: scrollKey,
      scrollContentHeight: contentH,
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowX: "hidden",
        overflowY: "auto",
        scrollbarWidth: 4,
      },
      children: (ctx) => this.#renderMessageBlocks(body, ctx, layout.blocks),
    })
  }

  #messageLayout(maxTextW: number): {blocks: RenderBlock[]; contentH: number} {
    let top = 0
    const blocks = this.#opts.messages().map((message) => {
      const lines = wrapText(this, message.text, maxTextW, MESSAGE_FONT)
      const height = (lines.length + 1) * MESSAGE_LINE_H + MESSAGE_PAD * 2
      const block: RenderBlock = {
        role: message.role,
        label: message.label ?? messageRoleLabel(message.role),
        lines,
        top,
        height,
        streaming: message.streaming === true,
      }
      top += height + MESSAGE_GAP
      return block
    })
    return {blocks, contentH: Math.max(0, top - MESSAGE_GAP)}
  }

  #messageKey(): string {
    const messages = this.#opts.messages()
    const last = messages[messages.length - 1]
    return `${this.#opts.activeSessionId()}:${messages.length}:${last?.role ?? ""}:${last?.text.length ?? 0}:${last?.streaming === true ? 1 : 0}`
  }

  #scrollKey(): string {
    return `${BROWSER_CHAT_SCROLL_KEY}:${this.#opts.activeSessionId()}`
  }

  #renderMessageBlocks(body: UiSurfaceRect, ctx: DivScrollContext, blocks: readonly RenderBlock[]): void {
    const viewportTop = ctx.scrollTop - MESSAGE_GAP
    const viewportBottom = ctx.scrollTop + ctx.viewportHeight + MESSAGE_GAP
    for (const block of blocks) {
      if (block.top + block.height < viewportTop) continue
      if (block.top > viewportBottom) break
      this.#drawMessageBlock(block, body.x, body.y + block.top - ctx.scrollTop, Math.max(1, ctx.viewportWidth), block.height)
    }
  }

  #drawMessageBlock(block: RenderBlock, x: number, y: number, w: number, h: number): void {
    const role = block.role
    const streaming = block.streaming
    const fill = role === "user"
      ? new Color(0.07, 0.11, 0.16, 0.72)
      : role === "assistant"
        ? new Color(0.045, 0.095, 0.09, 0.72)
        : new Color(0.08, 0.08, 0.085, 0.6)
    const border = streaming ? palette.cyan : palette.borderDim
    this.drawRoundedRect(x, y, w, h, {radius: 10, fill, border, borderWidth: streaming ? 1.2 : 1, z: Z.CONTAINER})

    let cy = y + MESSAGE_PAD
    this.drawText(`${block.label}:`, x + MESSAGE_PAD, cy, {
      fontPx: MESSAGE_FONT,
      material: role === "assistant" ? this.materials.cyan : role === "user" ? this.materials.text : this.materials.muted,
      maxWidthPx: Math.max(1, w - MESSAGE_PAD * 2),
      z: Z.TEXT,
    })
    cy += MESSAGE_LINE_H
    for (const line of block.lines) {
      if (line.length > 0) this.drawText(line, x + MESSAGE_PAD, cy, {
        fontPx: MESSAGE_FONT,
        material: role === "system" ? this.materials.muted : this.materials.text,
        maxWidthPx: Math.max(1, w - MESSAGE_PAD * 2),
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
  if (role === "assistant") return "Assistant"
  return "Status"
}

function wrapText(surface: UiSurface, text: string, maxW: number, fontPx: number): string[] {
  const out: string[] = []
  for (const sourceLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const normalized = sourceLine.replace(/\t/g, "  ").replace(/[ ]+$/g, "")
    if (normalized.trim().length === 0) {
      out.push("")
      continue
    }
    const marker = normalized.match(/^(\s*(?:[-*•]|\d+[.)])\s+)/)
    const leading = marker?.[1] ?? normalized.match(/^(\s+)/)?.[1] ?? ""
    const continuation = marker === null ? leading : " ".repeat(Math.min(12, marker[1]?.length ?? 0))
    const words = normalized.slice(leading.length).trim().split(/\s+/g)
    let prefix = leading
    let line = prefix
    for (const word of words) {
      const next = line.length === prefix.length ? `${line}${word}` : `${line} ${word}`
      if (surface.measureText(next, fontPx) <= maxW) {
        line = next
        continue
      }
      if (line.length > prefix.length) out.push(line)
      prefix = continuation
      line = `${prefix}${word}`
      while (surface.measureText(line, fontPx) > maxW && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && surface.measureText(line.slice(0, cut), fontPx) > maxW) cut -= 1
        out.push(line.slice(0, cut))
        line = line.slice(cut)
        prefix = ""
      }
    }
    out.push(line.length === 0 ? normalized : line)
  }
  return out.length === 0 ? [""] : out
}
