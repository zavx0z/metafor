/**
 * Toolbar renders in one immediate layer. It intentionally avoids nested
 * Yoga/TextBox labels because those labels are flaky in the top strip on
 * Retina Chrome. The card rect itself still comes from XrCanvas, so the toolbar
 * stays aligned with the rest of the UI.
 */

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Text,
  TextMaterial,
  TrueTypeFont,
} from "@metafor/engine"
import type {CardRect, XrCanvas, XrCard} from "./xr-canvas.ts"
import type {BadgeKind, ToolbarActions, ToolbarState} from "./xr-debug-ui.ts"

type HitBox = {x: number; y: number; w: number; h: number; action(): void; cursor: string}

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

export class XrToolbarCard implements XrCard {
  readonly node = new Object3D()

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
  readonly #bg = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color: UI.bg}))
  readonly #layer = new Object3D()
  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #greenMat = new TextMaterial({color: UI.green})
  readonly #orangeMat = new TextMaterial({color: UI.orange})
  readonly #redMat = new TextMaterial({color: UI.red})

  #canvas: XrCanvas | null = null
  #font: TrueTypeFont | null = null
  #pixelScale = 0.001
  #rectW = 1
  #rectH = 1
  #hits: HitBox[] = []

  constructor(actions: ToolbarActions) {
    this.#actions = actions
    this.node.name = "Toolbar"
    this.#bg.position.z = -0.03
    this.node.add(this.#bg)
    this.#layer.position.z = 0.02
    this.#layer.updateMatrix()
    this.node.add(this.#layer)
  }

  attachCanvas(canvas: XrCanvas): void {
    this.#canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.#font = font
    this.#pixelScale = pixelScale
    this.#rectW = rect.w
    this.#rectH = rect.h
    this.#render()
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.#render()
    this.#canvas?.requestRender()
  }

  onPointerMove(_event: MouseEvent, x: number, y: number): void {
    if (this.#canvas === null) return
    this.#canvas.canvas.style.cursor = this.#hitAt(x, y)?.cursor ?? "default"
  }

  onPointerDown(_event: MouseEvent, x: number, y: number): void {
    this.#hitAt(x, y)?.action()
  }

  onDeactivate(): void {
    if (this.#canvas !== null) this.#canvas.canvas.style.cursor = "default"
  }

  dispose(): void {
    this.#clearLayer()
  }

  #render(): void {
    if (this.#font === null) return

    this.#clearLayer()
    this.#hits = []

    this.#bg.geometry = new PlaneGeometry({
      width: Math.max(1, this.#rectW) * this.#pixelScale,
      height: Math.max(1, this.#rectH) * this.#pixelScale,
    })
    this.#bg.position.x = (this.#rectW / 2) * this.#pixelScale
    this.#bg.position.y = -(this.#rectH / 2) * this.#pixelScale
    this.#bg.updateMatrix()

    const pad = 10
    const gap = 8
    const buttonY = 6
    const buttonH = 26
    const buttons = [
      {label: this.#state.verbose ? "Hide log" : "Verbose", kind: this.#state.verbose ? "paused" as const : "neutral" as const, action: () => this.#actions.onToggleVerbose()},
      {label: "Pause", kind: "warn" as const, action: () => this.#actions.onPause()},
      {label: "Resume", kind: "live" as const, action: () => this.#actions.onResume()},
      {label: "Over", kind: "neutral" as const, action: () => this.#actions.onStep("over")},
      {label: "Into", kind: "neutral" as const, action: () => this.#actions.onStep("into")},
      {label: "Out", kind: "neutral" as const, action: () => this.#actions.onStep("out")},
    ]

    let right = this.#rectW - pad
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i]!
      const w = Math.ceil(b.label.length * 12 * 0.68) + 22
      right -= w
      this.#button(b.label, right, buttonY, w, buttonH, b.kind, b.action)
      right -= gap
    }

    let x = pad
    const rightLimit = Math.max(x, right - gap)
    this.#drawText("@metafor/bun-debug", x, 10, 13, this.#cyanMat, 170)
    x += 178

    x = this.#badge(`ws: ${this.#state.ws}`, x, 124, this.#state.wsKind, rightLimit)
    x = this.#badge(this.#state.connection, x, 190, this.#state.connectionKind, rightLimit)
    x = this.#badge(`run: ${compactRunStatus(this.#state.run)}`, x, 178, this.#state.runKind, rightLimit)

    if (x + 90 < rightLimit) {
      this.#drawText(this.#state.engine, x, 12, 11, this.#mutedMat, Math.min(98, rightLimit - x))
      x += 106
    }
    if (x + 40 < rightLimit) {
      this.#drawText(shortenUrl(this.#state.inspectorUrl), x, 12, 11, this.#mutedMat, rightLimit - x)
    }
  }

  #badge(label: string, x: number, w: number, kind: BadgeKind, rightLimit: number): number {
    if (x >= rightLimit) return x
    const actualW = Math.max(34, Math.min(w, rightLimit - x))
    this.#drawRect(x, 8, actualW, 22, toneFill(kind), -0.005)
    this.#drawRect(x, 8, actualW, 1, toneBorder(kind), 0.001)
    this.#drawText(label, x + 8, 13, 11, this.#toneText(kind), actualW - 16)
    return x + actualW + 8
  }

  #button(label: string, x: number, y: number, w: number, h: number, kind: BadgeKind, action: () => void): void {
    this.#drawRect(x, y, w, h, toneFill(kind), -0.004)
    this.#drawRect(x, y, w, 1, toneBorder(kind), 0.001)
    this.#drawRect(x, y + h - 1, w, 1, UI.border, 0.001)
    this.#drawRect(x, y, 1, h, UI.border, 0.001)
    this.#drawRect(x + w - 1, y, 1, h, UI.border, 0.001)
    this.#drawText(label, x + 10, y + Math.max(0, (h - 12) / 2 - 1), 12, this.#textMat, w - 20)
    this.#hits.push({x, y, w, h, action, cursor: "pointer"})
  }

  #drawText(value: string, x: number, y: number, fontPx: number, material: TextMaterial, maxWidthPx: number): void {
    if (this.#font === null || maxWidthPx <= 0) return
    const label = fitText(value, maxWidthPx, fontPx)
    const text = new Text(label, this.#font, fontPx * this.#pixelScale, material)
    text.position.x = x * this.#pixelScale
    text.position.y = -(y + fontPx) * this.#pixelScale
    text.position.z = 0.006
    text.updateMatrix()
    this.#layer.add(text)
  }

  #drawRect(x: number, y: number, w: number, h: number, color: Color, z: number): void {
    const mesh = new Mesh(
      new PlaneGeometry({width: Math.max(1, w) * this.#pixelScale, height: Math.max(1, h) * this.#pixelScale}),
      new MeshBasicMaterial({color}),
    )
    mesh.position.x = (x + w / 2) * this.#pixelScale
    mesh.position.y = -(y + h / 2) * this.#pixelScale
    mesh.position.z = z
    mesh.updateMatrix()
    this.#layer.add(mesh)
  }

  #toneText(kind: BadgeKind): TextMaterial {
    if (kind === "live") return this.#greenMat
    if (kind === "paused") return this.#orangeMat
    if (kind === "warn") return this.#redMat
    return this.#textMat
  }

  #hitAt(x: number, y: number): HitBox | null {
    for (let i = this.#hits.length - 1; i >= 0; i--) {
      const h = this.#hits[i]!
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
    }
    return null
  }

  #clearLayer(): void {
    const renderer = this.#canvas?.renderer
    for (const obj of this.#layer.children) {
      const text = obj as Text
      if (text.isText === true) {
        renderer?.invalidateGeometry(text.stencilGeometry)
        renderer?.invalidateGeometry(text.coverGeometry)
        continue
      }
      const mesh = obj as Mesh
      if (mesh.geometry !== undefined) renderer?.invalidateGeometry(mesh.geometry)
    }
    this.#layer.children = []
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

function fitText(value: string, widthPx: number, fontPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / Math.max(1, fontPx * 0.68)))
  if (value.length <= max) return value
  if (max <= 3) return value.slice(0, max)
  return `${value.slice(0, max - 3)}...`
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
