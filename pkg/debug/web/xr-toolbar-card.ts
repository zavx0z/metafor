/**
 * Toolbar — верхняя полоса с title + status badges + кнопками.
 * Yoga layout: row, gap-driven spacing, последний spacer flexGrow:1
 * чтобы кнопки прижимались к правому краю.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {XrLayoutCard} from "./xr-layout.ts"
import {Box, Component, FilledBox, TextBox} from "./xr-component.ts"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./xr-debug-ui.ts"

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(11, 15, 22, 1),
  bgElevated: rgb(27, 34, 45, 0.96),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  green: rgb(82, 196, 123, 1),
  orange: rgb(255, 190, 111, 1),
  red: rgb(255, 127, 111, 1),
  border: rgb(116, 130, 151, 1),
  // tone fills (badge bg)
  liveFill: rgb(21, 50, 37, 0.98),
  pausedFill: rgb(61, 45, 24, 0.98),
  warnFill: rgb(58, 32, 28, 0.98),
}

export class XrToolbarCard extends XrLayoutCard {
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
    super()
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.requestRebuild()
  }

  protected build(): Component {
    const root = new FilledBox(
      {flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 14, gap: 8},
      UI.bg,
      -0.02,
    )

    // Brand.
    root.add(new TextBox("@metafor/bun-debug", {
      fontPx: 13,
      material: this.#cyanMat,
      boxHeight: 18,
      layout: {flexShrink: 0},
    }))

    // Status badges.
    root.add(this.#badge(`ws: ${this.#state.ws}`, this.#state.wsKind))
    root.add(this.#badge(this.#state.connection, this.#state.connectionKind))
    root.add(this.#badge(`run: ${this.#state.run}`, this.#state.runKind))

    // Engine + URL muted info.
    root.add(new TextBox(this.#state.engine, {
      fontPx: 11,
      material: this.#mutedMat,
      boxHeight: 14,
      layout: {flexShrink: 0},
    }))
    root.add(new TextBox(shortenUrl(this.#state.inspectorUrl), {
      fontPx: 11,
      material: this.#mutedMat,
      boxHeight: 14,
      layout: {flexShrink: 1},
    }))

    // Spacer: занимает остаток, прижимает кнопки вправо.
    root.add(new Box({flexGrow: 1, height: 1}))

    // Buttons.
    root.add(this.#button(this.#state.verbose ? "Hide log" : "Verbose", () => this.#actions.onToggleVerbose(), this.#state.verbose ? "paused" : "neutral"))
    root.add(this.#button("Pause", () => this.#actions.onPause(), "warn"))
    root.add(this.#button("Resume", () => this.#actions.onResume(), "live"))
    root.add(this.#button("Over", () => this.#actions.onStep("over"), "neutral"))
    root.add(this.#button("Into", () => this.#actions.onStep("into"), "neutral"))
    root.add(this.#button("Out", () => this.#actions.onStep("out"), "neutral"))

    return root
  }

  #badge(label: string, kind: BadgeKind): Component {
    const fill = toneFill(kind)
    const badge = new FilledBox(
      {paddingLeft: 8, paddingRight: 8, height: 22, justifyContent: "center", alignItems: "center", flexShrink: 0},
      fill,
      -0.001,
    )
    badge.add(new TextBox(label, {fontPx: 11, material: this.#toneText(kind), boxHeight: 14}))
    return badge
  }

  #button(label: string, action: () => void, kind: BadgeKind): Component {
    const fill = toneFill(kind)
    const btn = new FilledBox(
      {paddingLeft: 10, paddingRight: 10, height: 26, justifyContent: "center", alignItems: "center", flexShrink: 0},
      fill,
      -0.001,
    )
    btn.add(new TextBox(label, {fontPx: 12, material: this.#toneText(kind), boxHeight: 14}))
    this.hit(btn, action)
    return btn
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

function shortenUrl(url: string): string {
  if (url.length <= 64) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}
