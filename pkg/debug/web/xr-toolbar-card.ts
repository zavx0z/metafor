/**
 * Toolbar — верхняя полоса. Card-system.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Card, Z} from "./xr-card.ts"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./xr-debug-ui.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(11, 15, 22, 1),
  bgElevated: rgb(27, 34, 45, 0.98),
  text: rgb(245, 248, 252, 1),
  muted: rgb(158, 168, 182, 1),
  cyan: rgb(111, 211, 255, 1),
  green: rgb(100, 224, 141, 1),
  orange: rgb(255, 205, 130, 1),
  red: rgb(255, 145, 128, 1),
  border: rgb(116, 130, 151, 1),
  liveFill: rgb(18, 58, 39, 1),
  pausedFill: rgb(72, 48, 19, 1),
  warnFill: rgb(76, 35, 29, 1),
}

const PAD_X = 10
const GAP = 8
const BADGE_H = 22
const BTN_H = 26
const BTN_PAD = 12

export class XrToolbarCard extends Card {
  #state: ToolbarState = {
    ws: "connecting...",
    wsKind: "neutral",
    connection: "inspector: connecting",
    connectionKind: "neutral",
    run: "waiting",
    runKind: "neutral",
    inspectorUrl: "",
    verbose: false,
    engine: "engine: init",
  }

  readonly #actions: ToolbarActions
  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #greenMat = new TextMaterial({color: UI.green})
  readonly #orangeMat = new TextMaterial({color: UI.orange})
  readonly #redMat = new TextMaterial({color: UI.red})

  constructor(actions: ToolbarActions) {
    super({bgColor: UI.bg, borderColor: null})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const buttons: Array<{label: string; kind: BadgeKind; action(): void}> = [
      {label: this.#state.verbose ? "Hide log" : "Verbose", kind: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: "Pause", kind: "warn", action: () => this.#actions.onPause()},
      {label: "Resume", kind: "live", action: () => this.#actions.onResume()},
      {label: "Over", kind: "neutral", action: () => this.#actions.onStep("over")},
      {label: "Into", kind: "neutral", action: () => this.#actions.onStep("into")},
      {label: "Out", kind: "neutral", action: () => this.#actions.onStep("out")},
    ]

    let right = this.rectW - PAD_X
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i]!
      const labelW = this.measureText(b.label, 12)
      const w = Math.ceil(labelW) + BTN_PAD * 2
      right -= w
      this.#button(b.label, right, buttonY, w, BTN_H, b.kind, b.action)
      right -= GAP
    }
    const rightLimit = Math.max(PAD_X, right)

    // Левая часть: brand + badges + engine + url.
    const badgeY = (this.rectH - BADGE_H) / 2
    let x = PAD_X
    const brandW = this.measureText("@metafor/bun-debug", 13)
    const brandActualW = Math.min(brandW, rightLimit - x)
    if (brandActualW > 12) {
      this.drawText("@metafor/bun-debug", x, (this.rectH - 13) / 2 - 2, {
        fontPx: 13,
        material: this.#cyanMat,
        maxWidthPx: brandActualW,
      })
    }
    x += brandActualW + GAP

    x = this.#badge(`ws: ${this.#state.ws}`, x, badgeY, this.#state.wsKind, rightLimit)
    x = this.#badge(this.#state.connection, x, badgeY, this.#state.connectionKind, rightLimit)
    x = this.#badge(`run: ${compactRunStatus(this.#state.run)}`, x, badgeY, this.#state.runKind, rightLimit)

    if (rightLimit - x > 60) {
      const w = this.drawText(this.#state.engine, x, (this.rectH - 11) / 2 - 1, {
        fontPx: 11,
        material: this.#mutedMat,
        maxWidthPx: Math.min(110, rightLimit - x),
      })
      x += Math.max(40, w) + GAP
    }
    if (rightLimit - x > 40) {
      this.drawText(shortenUrl(this.#state.inspectorUrl), x, (this.rectH - 11) / 2 - 1, {
        fontPx: 11,
        material: this.#mutedMat,
        maxWidthPx: rightLimit - x,
      })
    }
  }

  #badge(label: string, x: number, y: number, kind: BadgeKind, rightLimit: number): number {
    const labelW = this.measureText(label, 11)
    const padded = Math.ceil(labelW) + 16
    const w = Math.min(padded, rightLimit - x)
    if (w < 24) return x
    this.drawRect(x, y, w, BADGE_H, toneFill(kind), Z.ELEMENT)
    this.drawRect(x, y, w, 1, toneBorder(kind), Z.ELEMENT_RULE)
    this.drawText(label, x + 8, y + (BADGE_H - 11) / 2, {
      fontPx: 11,
      material: this.#toneText(kind),
      maxWidthPx: w - 16,
    })
    return x + w + GAP
  }

  #button(label: string, x: number, y: number, w: number, h: number, kind: BadgeKind, action: () => void): void {
    this.drawRect(x, y, w, h, toneFill(kind), Z.ELEMENT)
    this.drawRect(x, y, w, 1, toneBorder(kind), Z.ELEMENT_RULE)
    this.drawRect(x, y + h - 1, w, 1, UI.border, Z.ELEMENT_RULE)
    this.drawRect(x, y, 1, h, UI.border, Z.ELEMENT_RULE)
    this.drawRect(x + w - 1, y, 1, h, UI.border, Z.ELEMENT_RULE)
    const labelW = this.measureText(label, 12)
    const labelX = x + (w - labelW) / 2
    this.drawText(label, labelX, y + (h - 12) / 2 - 1, {
      fontPx: 12,
      material: this.#textMat,
      maxWidthPx: w - 6,
    })
    this.hit(x, y, w, h, action, "pointer")
  }

  #toneText(kind: BadgeKind): TextMaterial {
    if (kind === "live") return this.#greenMat
    if (kind === "paused") return this.#orangeMat
    if (kind === "warn") return this.#redMat
    return this.#textMat
  }
}

function toneFill(kind: BadgeKind): Color {
  if (kind === "live") return UI.liveFill
  if (kind === "paused") return UI.pausedFill
  if (kind === "warn") return UI.warnFill
  return UI.bgElevated
}

function toneBorder(kind: BadgeKind): Color {
  if (kind === "live") return UI.green
  if (kind === "paused") return UI.orange
  if (kind === "warn") return UI.red
  return UI.border
}

function shortenUrl(url: string): string {
  if (url.length <= 64) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}

function compactRunStatus(value: string): string {
  if (value === "paused (PauseOnNextStatement)") return "paused: on-next"
  if (value === "running (pause pending)") return "pause pending"
  return value
}
