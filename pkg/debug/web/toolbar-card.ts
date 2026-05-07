/**
 * Toolbar — верхняя полоса. Card-system.
 * Кнопки и бейджи через widget-функции из @metafor/ui (одинаковый
 * look-and-feel с playground-демо).
 */

import {Card, palette, button, badge, autoButtonWidth} from "@metafor/ui"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./debug-ui.ts"

const PAD_X = 10
const GAP = 8
const BADGE_H = 22
const BTN_H = 26

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
    super({bgColor: palette.bgToolbar, borderColor: null})
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRender()
  }

  protected render(): void {
    const buttonY = (this.rectH - BTN_H) / 2
    const buttons: Array<{label: string; tone: BadgeKind; action(): void}> = [
      {label: this.#state.verbose ? "Hide log" : "Verbose", tone: this.#state.verbose ? "paused" : "neutral", action: () => this.#actions.onToggleVerbose()},
      {label: "Pause", tone: "warn", action: () => this.#actions.onPause()},
      {label: "Resume", tone: "live", action: () => this.#actions.onResume()},
      {label: "Over", tone: "neutral", action: () => this.#actions.onStep("over")},
      {label: "Into", tone: "neutral", action: () => this.#actions.onStep("into")},
      {label: "Out", tone: "neutral", action: () => this.#actions.onStep("out")},
    ]

    let right = this.rectW - PAD_X
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i]!
      const w = autoButtonWidth(this, b.label, 12, 12)
      right -= w
      button(this, right, buttonY, w, BTN_H, {label: b.label, tone: b.tone, action: b.action})
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
        material: this.materials.cyan,
        maxWidthPx: brandActualW,
      })
    }
    x += brandActualW + GAP

    x = this.#fitBadge(`ws: ${this.#state.ws}`, x, badgeY, this.#state.wsKind, rightLimit)
    x = this.#fitBadge(this.#state.connection, x, badgeY, this.#state.connectionKind, rightLimit)
    x = this.#fitBadge(`run: ${compactRunStatus(this.#state.run)}`, x, badgeY, this.#state.runKind, rightLimit)

    if (rightLimit - x > 60) {
      const w = this.drawText(this.#state.engine, x, (this.rectH - 11) / 2 - 1, {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: Math.min(110, rightLimit - x),
      })
      x += Math.max(40, w) + GAP
    }
    if (rightLimit - x > 40) {
      this.drawText(shortenUrl(this.#state.inspectorUrl), x, (this.rectH - 11) / 2 - 1, {
        fontPx: 11,
        material: this.materials.muted,
        maxWidthPx: rightLimit - x,
      })
    }
  }

  #fitBadge(label: string, x: number, y: number, tone: BadgeKind, rightLimit: number): number {
    const labelW = this.measureText(label, 11)
    const padded = Math.ceil(labelW) + 16
    const w = Math.min(padded, rightLimit - x)
    if (w < 24) return x
    badge(this, x, y, w, BADGE_H, {label, tone, fontPx: 11})
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
