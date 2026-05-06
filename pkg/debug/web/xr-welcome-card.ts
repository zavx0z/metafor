/**
 * Welcome card на Card-системе.
 *
 * Stack: title + status panel + (target panel | inspector panel) + lower badges.
 * Все координаты — pixel от card-TL, никаких эстимейтов.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Card} from "./xr-card.ts"
import type {WelcomeActions, WelcomeState} from "./xr-debug-ui.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.96),
  bgElevated: rgb(27, 34, 45, 0.96),
  bgHot: rgb(38, 49, 66, 0.98),
  bgPanel: rgb(14, 19, 28, 0.98),
  bgLower: rgb(14, 19, 28, 0.88),
  border: rgb(116, 130, 151, 1),
  borderDim: rgb(62, 74, 92, 1),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  green: rgb(82, 196, 123, 1),
  greenFill: rgb(21, 50, 37, 1),
  orange: rgb(255, 190, 111, 1),
  orangeFill: rgb(61, 45, 24, 1),
  red: rgb(255, 127, 111, 1),
  redFill: rgb(58, 32, 28, 1),
  input: rgb(10, 14, 21, 0.98),
}

type Tone = "neutral" | "live" | "paused" | "warn"

const PAD = 18
const GAP = 16

export class XrWelcomeCard extends Card {
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

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #greenMat = new TextMaterial({color: UI.green})
  readonly #orangeMat = new TextMaterial({color: UI.orange})
  readonly #redMat = new TextMaterial({color: UI.red})

  constructor(actions: WelcomeActions) {
    super({bgColor: UI.bg, borderColor: UI.borderDim, borderWidthPx: 1})
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
      material: this.#cyanMat,
      maxWidthPx: this.rectW - PAD * 2,
    })

    // Status panel.
    const statusY = 46
    const statusH = 72
    const contentW = this.rectW - PAD * 2
    this.drawRect(PAD, statusY, contentW, statusH, UI.bgElevated, 0)
    const statusKind = this.#state.connectionState === "connected" ? UI.green : UI.red
    this.drawRect(PAD, statusY, 3, statusH, statusKind, 0.001)
    const statusMat = this.#state.connectionState === "connected" ? this.#greenMat
      : this.#state.connectionState === "connecting" ? this.#cyanMat
        : this.#redMat
    const error = this.#state.connectionError === null ? "" : ` (${this.#state.connectionError})`
    this.drawText(`Inspector ${this.#state.connectionState}${error}`, PAD + 16, statusY + 14, {
      fontPx: 14,
      material: statusMat,
      maxWidthPx: contentW - 32,
    })
    this.drawText(`Target ${this.#state.targetStatus}`, PAD + 16, statusY + 42, {
      fontPx: 12,
      material: this.#mutedMat,
      maxWidthPx: contentW - 32,
    })

    // Two panels: target on left, inspector on right.
    const panelY = 142
    const panelH = 222
    const leftW = Math.floor((contentW - GAP) * 0.58)
    const rightW = contentW - GAP - leftW
    const rightX = PAD + leftW + GAP
    this.drawRect(PAD, panelY, leftW, panelH, UI.bgPanel, 0)
    this.drawRect(rightX, panelY, rightW, panelH, UI.bgPanel, 0)

    // Target panel content.
    this.drawText("Target", PAD + 14, panelY + 14, {
      fontPx: 13,
      material: this.#orangeMat,
      maxWidthPx: leftW - 28,
    })
    this.#input(this.#command, PAD + 14, panelY + 56, leftW - 28, 34, this.#active === "command", () => {
      this.#active = "command"
      this.requestRender()
    })
    this.#button("Run target", PAD + 14, panelY + 112, 104, 30, "live", () => this.#actions.onRun(this.#command, this.#state.pauseOnStart))
    this.#button("Stop", PAD + 124, panelY + 112, 64, 30, "warn", () => this.#actions.onStop())
    const pauseLabel = this.#state.pauseOnStart ? "pause: on" : "pause: off"
    this.#button(pauseLabel, PAD + 194, panelY + 112, 102, 30, this.#state.pauseOnStart ? "paused" : "neutral", () => {
      const next = !this.#state.pauseOnStart
      this.#state = {...this.#state, pauseOnStart: next}
      this.#actions.onPauseOnStart(next)
      this.requestRender()
    })
    this.drawText("Run uses the command exactly as typed.", PAD + 14, panelY + 168, {
      fontPx: 11,
      material: this.#mutedMat,
      maxWidthPx: leftW - 28,
    })

    // Inspector panel content.
    this.drawText("Inspector", rightX + 14, panelY + 14, {
      fontPx: 13,
      material: this.#cyanMat,
      maxWidthPx: rightW - 28,
    })
    this.#input(this.#url, rightX + 14, panelY + 56, rightW - 28, 34, this.#active === "url", () => {
      this.#active = "url"
      this.requestRender()
    })
    this.#button("Apply", rightX + 14, panelY + 112, 74, 30, "neutral", () => this.#actions.onApplyInspector(this.#url))
    this.drawText("DevTools mirror", rightX + 14, panelY + 168, {
      fontPx: 11,
      material: this.#mutedMat,
      maxWidthPx: rightW - 28,
    })
    const mirrorUrl = `https://debug.bun.sh/#${this.#url.replace(/^wss?:\/\//, "")}`
    this.drawText(mirrorUrl, rightX + 14, panelY + 188, {
      fontPx: 11,
      material: this.#mutedMat,
      maxWidthPx: rightW - 28,
    })

    // Lower badges.
    const lowerY = panelY + panelH + 18
    if (lowerY + 70 <= this.rectH - PAD) {
      this.drawRect(PAD, lowerY, contentW, 70, UI.bgLower, 0)
      let bx = PAD + 16
      bx = this.#badge("renderer: WebGPU", bx, lowerY + 22, "live") + 12
      bx = this.#badge("layout: rects", bx, lowerY + 22, "live") + 12
      this.#badge("style: vision cards", bx, lowerY + 22, "paused")
    }
  }

  #badge(label: string, x: number, y: number, kind: Tone): number {
    const labelW = this.measureText(label, 11)
    const w = Math.ceil(labelW) + 18
    this.drawRect(x, y, w, 22, toneFill(kind), -0.001)
    this.drawRect(x, y, w, 1, toneBorder(kind), 0.001)
    this.drawText(label, x + 9, y + 5, {
      fontPx: 11,
      material: this.#toneText(kind),
      maxWidthPx: w - 16,
    })
    return x + w
  }

  #button(label: string, x: number, y: number, w: number, h: number, kind: Tone, action: () => void): void {
    this.drawRect(x, y, w, h, toneFill(kind), -0.001)
    this.drawRect(x, y, w, 1, toneBorder(kind), 0.001)
    this.drawRect(x, y + h - 1, w, 1, UI.border, 0.001)
    this.drawRect(x, y, 1, h, UI.border, 0.001)
    this.drawRect(x + w - 1, y, 1, h, UI.border, 0.001)
    const labelW = this.measureText(label, 12)
    this.drawText(label, x + (w - labelW) / 2, y + (h - 12) / 2, {
      fontPx: 12,
      material: this.#toneText(kind),
      maxWidthPx: w - 6,
    })
    this.hit(x, y, w, h, action)
  }

  #input(value: string, x: number, y: number, w: number, h: number, active: boolean, onActivate: () => void): void {
    this.drawRect(x, y, w, h, active ? UI.bgHot : UI.input, -0.001)
    this.drawRect(x, y, w, 1, active ? UI.cyan : UI.borderDim, 0.001)
    this.drawRect(x, y + h - 1, w, 1, UI.borderDim, 0.001)
    this.drawRect(x, y, 1, h, UI.borderDim, 0.001)
    this.drawRect(x + w - 1, y, 1, h, UI.borderDim, 0.001)
    const display = active ? `${value}|` : value
    this.drawText(display, x + 10, y + (h - 12) / 2, {
      fontPx: 12,
      material: active ? this.#textMat : this.#mutedMat,
      maxWidthPx: w - 20,
    })
    this.hit(x, y, w, h, onActivate, "text")
  }

  #toneText(kind: Tone): TextMaterial {
    if (kind === "live") return this.#greenMat
    if (kind === "paused") return this.#orangeMat
    if (kind === "warn") return this.#redMat
    return this.#textMat
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

function toneFill(kind: Tone): Color {
  if (kind === "live") return UI.greenFill
  if (kind === "paused") return UI.orangeFill
  if (kind === "warn") return UI.redFill
  return UI.bgElevated
}

function toneBorder(kind: Tone): Color {
  if (kind === "live") return UI.green
  if (kind === "paused") return UI.orange
  if (kind === "warn") return UI.red
  return UI.border
}
