/**
 * Welcome card на Card-системе. Widget'ы button/badge/input — из @metafor/ui.
 *
 * Stack: title + status panel + (target panel | inspector panel) + lower badges.
 * Все координаты — pixel от card-TL, никаких эстимейтов.
 */

import {Card, Z, palette, radii, uiIcons, button, badge, input, type Tone} from "@metafor/ui"
import type {WelcomeActions, WelcomeState} from "./debug-ui.ts"

const STATUS_BG_OK = palette.green
const STATUS_BG_FAIL = palette.red

const PAD = 18
const GAP = 16

export class WelcomeCard extends Card {
  #state: WelcomeState = {
    connectionState: "connecting",
    connectionError: null,
    inspectorUrl: "",
    targetStatus: "target not started",
    defaultCommand: "",
    pauseOnStart: false,
  }
  #url = ""
  #command = ""
  #active: "command" | "url" | null = null
  readonly #actions: WelcomeActions

  constructor(actions: WelcomeActions) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.cardLarge})
    this.#actions = actions
  }

  setState(next: WelcomeState): void {
    const wasEmpty = this.#command.length === 0
    this.#state = next
    if (this.#active !== "url") this.#url = next.inspectorUrl
    if (this.#active !== "command" && wasEmpty) this.#command = next.defaultCommand
    this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    if (this.#active === null) return
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      if (this.#active === "command") this.#actions.onRun(this.#command, this.#state.pauseOnStart)
      else this.#actions.onApplyInspector(this.#url)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      event.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        this.#setActiveValue(this.#active, this.#activeValue() + text)
      })
      return
    }
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#setActiveValue(this.#active, this.#activeValue().slice(0, -1))
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#setActiveValue(this.#active, this.#activeValue() + event.key)
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#active !== null) {
      this.#active = null
      this.requestRender()
    }
  }

  protected render(): void {
    // Title.
    this.drawText("WebGPU UI Debugger", PAD, 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - PAD * 2,
    })

    // Status panel.
    const statusY = 46
    const statusH = 72
    const contentW = this.rectW - PAD * 2
    this.drawRoundedRect(PAD, statusY, contentW, statusH, {
      radius: 8,
      fill: palette.bgElevated,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    const statusKind = this.#state.connectionState === "connected" ? STATUS_BG_OK : STATUS_BG_FAIL
    this.drawRect(PAD, statusY, 3, statusH, statusKind, Z.SEPARATOR)
    const statusMat = this.#state.connectionState === "connected" ? this.materials.green
      : this.#state.connectionState === "connecting" ? this.materials.cyan
        : this.materials.red
    const error = this.#state.connectionError === null ? "" : ` (${this.#state.connectionError})`
    this.drawText(`Inspector ${this.#state.connectionState}${error}`, PAD + 16, statusY + 14, {
      fontPx: 14,
      material: statusMat,
      maxWidthPx: contentW - 32,
    })
    this.drawText(`Target ${this.#state.targetStatus}`, PAD + 16, statusY + 42, {
      fontPx: 12,
      material: this.materials.muted,
      maxWidthPx: contentW - 32,
    })

    // Two panels: target on left, inspector on right.
    const panelY = 142
    const panelH = 222
    const leftW = Math.floor((contentW - GAP) * 0.58)
    const rightW = contentW - GAP - leftW
    const rightX = PAD + leftW + GAP
    this.drawRoundedRect(PAD, panelY, leftW, panelH, {
      radius: 8,
      fill: palette.bgPanel,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.drawRoundedRect(rightX, panelY, rightW, panelH, {
      radius: 8,
      fill: palette.bgPanel,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })

    // Target panel.
    this.drawText("Target", PAD + 14, panelY + 14, {
      fontPx: 13,
      material: this.materials.orange,
      maxWidthPx: leftW - 28,
    })
    input(this, PAD + 14, panelY + 56, leftW - 28, 34, {
      value: this.#command,
      active: this.#active === "command",
      onActivate: () => {
        this.#active = "command"
        this.requestRender()
      },
    })
    button(this, PAD + 14, panelY + 112, 40, 30, {
      label: "Run target", iconSrc: uiIcons.run, iconOnly: true, tooltip: "Run target", tone: "live",
      action: () => this.#actions.onRun(this.#command, this.#state.pauseOnStart),
    })
    button(this, PAD + 62, panelY + 112, 40, 30, {
      label: "Stop target", iconSrc: uiIcons.stop, iconOnly: true, tooltip: "Stop target", tone: "warn", action: () => this.#actions.onStop(),
    })
    const pauseLabel = this.#state.pauseOnStart ? "pause: on" : "pause: off"
    button(this, PAD + 110, panelY + 112, 40, 30, {
      label: pauseLabel,
      iconSrc: this.#state.pauseOnStart ? uiIcons.pause : uiIcons.run,
      iconOnly: true,
      tooltip: pauseLabel,
      tone: this.#state.pauseOnStart ? "paused" : "neutral",
      action: () => {
        const next = !this.#state.pauseOnStart
        this.#state = {...this.#state, pauseOnStart: next}
        this.#actions.onPauseOnStart(next)
        this.requestRender()
      },
    })
    this.drawText("Run uses the command exactly as typed.", PAD + 14, panelY + 168, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: leftW - 28,
    })

    // Inspector panel.
    this.drawText("Inspector", rightX + 14, panelY + 14, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: rightW - 28,
    })
    input(this, rightX + 14, panelY + 56, rightW - 28, 34, {
      value: this.#url,
      active: this.#active === "url",
      onActivate: () => {
        this.#active = "url"
        this.requestRender()
      },
    })
    button(this, rightX + 14, panelY + 112, 40, 30, {
      label: "Apply inspector URL", iconSrc: uiIcons.apply, iconOnly: true, tooltip: "Apply inspector URL", tone: "neutral",
      action: () => this.#actions.onApplyInspector(this.#url),
    })
    this.drawText("DevTools mirror", rightX + 14, panelY + 168, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: rightW - 28,
    })
    const mirrorUrl = `https://debug.bun.sh/#${this.#url.replace(/^wss?:\/\//, "")}`
    this.drawText(mirrorUrl, rightX + 14, panelY + 188, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: rightW - 28,
    })

    // Lower badges.
    const lowerY = panelY + panelH + 18
    if (lowerY + 70 <= this.rectH - PAD) {
      this.drawRoundedRect(PAD, lowerY, contentW, 70, {
        radius: 8,
        fill: palette.bgPanelDim,
        border: palette.borderDim,
        borderWidth: 1,
        z: Z.CONTAINER,
      })
      const bw = (label: string): number => Math.ceil(this.measureText(label, 11)) + 18
      const labels: Array<{label: string; tone: Tone}> = [
        {label: "renderer: WebGPU", tone: "live"},
        {label: "layout: rects", tone: "live"},
        {label: "style: vision cards", tone: "paused"},
      ]
      let bx = PAD + 16
      for (const item of labels) {
        const w = bw(item.label)
        badge(this, bx, lowerY + 22, w, 22, {label: item.label, tone: item.tone, fontPx: 11})
        bx += w + 12
      }
    }
  }

  #activeValue(): string {
    return this.#active === "url" ? this.#url : this.#command
  }

  #setActiveValue(active: "command" | "url" | null, value: string): void {
    if (active === "url") this.#url = value
    if (active === "command") {
      this.#command = value
      localStorage.setItem("bd:target:cmd", value)
    }
    this.requestRender()
  }
}
