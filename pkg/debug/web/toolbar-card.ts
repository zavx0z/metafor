/**
 * Toolbar — верхняя полоса. Card-system.
 * Кнопки и бейджи через widget-функции из @metafor/ui (одинаковый
 * look-and-feel с playground-демо).
 */

import {Card, palette, radii, uiIcons, button, badge} from "@metafor/ui"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./debug-ui.ts"

const PAD_X = 8
const GAP = 6
const BADGE_H = 20
const BTN_H = 30
const BTN_W = 36
const BADGE_FONT = 10
const META_FONT = 10

export class ToolbarCard extends Card {
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

  constructor(actions: ToolbarActions) {
    super({bgColor: palette.bgToolbar, borderColor: null, borderRadiusPx: radii.card})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const buttons: Array<{label: string; iconSrc: string; tone: BadgeKind; action(): void}> = [
      {label: this.#state.verbose ? "Hide verbose log" : "Show verbose log", iconSrc: uiIcons.log, tone: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: "Pause", iconSrc: uiIcons.pause, tone: "warn", action: () => this.#actions.onPause()},
      {label: "Resume", iconSrc: uiIcons.resume, tone: "live", action: () => this.#actions.onResume()},
      {label: "Step over", iconSrc: uiIcons.stepOver, tone: "neutral", action: () => this.#actions.onStep("over")},
      {label: "Step into", iconSrc: uiIcons.stepInto, tone: "neutral", action: () => this.#actions.onStep("into")},
      {label: "Step out", iconSrc: uiIcons.stepOut, tone: "neutral", action: () => this.#actions.onStep("out")},
    ]

    let right = this.rectW - PAD_X
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i]!
      const w = BTN_W
      right -= w
      button(this, right, buttonY, w, BTN_H, {
        label: b.label,
        iconSrc: b.iconSrc,
        iconOnly: true,
        iconSizePx: 16,
        tooltip: b.label,
        tone: b.tone,
        action: b.action,
      })
      right -= GAP
    }
    const rightLimit = Math.max(PAD_X, right)

    // Левая часть: только operational state. Название пакета уже есть в
    // document title/URL и в toolbar занимало полезное место.
    const badgeY = (this.rectH - BADGE_H) / 2
    let x = PAD_X

    x = this.#fitBadge(`ws: ${this.#state.ws}`, x, badgeY, this.#state.wsKind, rightLimit)
    x = this.#fitBadge(this.#state.connection, x, badgeY, this.#state.connectionKind, rightLimit)
    x = this.#fitBadge(`run: ${compactRunStatus(this.#state.run)}`, x, badgeY, this.#state.runKind, rightLimit)

    if (rightLimit - x > 60) {
      const w = this.drawText(this.#state.engine, x, (this.rectH - META_FONT) / 2, {
        fontPx: META_FONT,
        material: this.materials.muted,
        maxWidthPx: Math.min(96, rightLimit - x),
      })
      x += Math.max(40, w) + GAP
    }
    if (rightLimit - x > 80) {
      this.drawText(shortenUrl(this.#state.inspectorUrl), x, (this.rectH - META_FONT) / 2, {
        fontPx: META_FONT,
        material: this.materials.muted,
        maxWidthPx: rightLimit - x,
      })
    }
  }

  #fitBadge(label: string, x: number, y: number, tone: BadgeKind, rightLimit: number): number {
    const labelW = this.measureText(label, BADGE_FONT)
    const padded = Math.ceil(labelW) + 14
    const w = Math.min(padded, rightLimit - x)
    if (w < 22) return x
    badge(this, x, y, w, BADGE_H, {label, tone, fontPx: BADGE_FONT})
    return x + w + GAP
  }
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
