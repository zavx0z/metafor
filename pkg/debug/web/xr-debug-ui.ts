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

export type BadgeKind = "neutral" | "live" | "paused" | "warn"

export type ToolbarState = {
  ws: string
  wsKind: BadgeKind
  connection: string
  connectionKind: BadgeKind
  run: string
  runKind: BadgeKind
  inspectorUrl: string
  verbose: boolean
  engine: string
}

export type ToolbarActions = {
  onPause(): void
  onResume(): void
  onStep(kind: "over" | "into" | "out"): void
  onToggleVerbose(): void
}

export type XrPropertySnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  description?: string
  objectId?: string
  preview?: unknown
}

export type XrScopeSnapshot = {
  type: "local" | "closure"
  name?: string
  objectId?: string
  properties: Record<string, XrPropertySnapshot>
  error?: string
}

export type XrFrameSnapshot = {
  index: number
  function: string
  url: string
  line: number
  column: number
  scriptId?: string
  callFrameId?: string
  scopes: {
    local: XrScopeSnapshot[]
    closure: XrScopeSnapshot[]
  }
}

export type WelcomeState = {
  connectionState: "connecting" | "connected" | "disconnected"
  connectionError: string | null
  inspectorUrl: string
  targetStatus: string
  defaultCommand: string
  pauseOnStart: boolean
}

export type WelcomeActions = {
  onRun(command: string, pauseOnStart: boolean): void
  onStop(): void
  onApplyInspector(url: string): void
  onPauseOnStart(pause: boolean): void
}

type HitBox = {
  x: number
  y: number
  w: number
  h: number
  cursor?: string
  action(): void
}

const rgb = (r: number, g: number, b: number, a = 1): Color => new Color(r / 255, g / 255, b / 255, a)

const UI = {
  bg: rgb(18, 23, 32, 0.94),
  bgElevated: rgb(27, 34, 45, 0.96),
  bgHot: rgb(38, 49, 66, 0.98),
  border: rgb(116, 130, 151, 1),
  borderDim: rgb(62, 74, 92, 1),
  text: rgb(232, 238, 247, 1),
  muted: rgb(139, 150, 166, 1),
  cyan: rgb(111, 211, 255, 1),
  green: rgb(82, 196, 123, 1),
  orange: rgb(255, 190, 111, 1),
  red: rgb(255, 127, 111, 1),
  blue: rgb(92, 155, 255, 1),
  violet: rgb(197, 151, 255, 1),
  input: rgb(10, 14, 21, 0.98),
}

function fitText(value: string, widthPx: number, fontPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / Math.max(1, fontPx * 0.58)))
  if (value.length <= max) return value
  if (max <= 4) return value.slice(0, max)
  return `${value.slice(0, max - 3)}...`
}

function shortenUrl(url: string): string {
  if (url.length <= 64) return url
  const parts = url.split("/")
  return `.../${parts.slice(-2).join("/")}`
}

function formatValue(v: XrPropertySnapshot): string {
  if (v.value !== undefined) {
    if (typeof v.value === "string") return JSON.stringify(v.value)
    return String(v.value)
  }
  if (v.description !== undefined) return String(v.description)
  if (v.className !== undefined) return v.className
  if (v.type !== undefined) return v.type
  return "?"
}

function formatTimestamp(ts: string): string {
  const t = ts.indexOf("T")
  if (t < 0) return ts
  const dot = ts.indexOf(".", t)
  return ts.slice(t + 1, dot < 0 ? undefined : dot)
}

abstract class XrPanelCard implements XrCard {
  readonly node = new Object3D()
  protected canvas: XrCanvas | null = null
  protected font: TrueTypeFont | null = null
  protected pixelScale = 0.001
  protected rectW = 1
  protected rectH = 1

  readonly #background: Mesh
  readonly #borderTop: Mesh
  readonly #borderBottom: Mesh
  readonly #borderLeft: Mesh
  readonly #borderRight: Mesh
  readonly #layer = new Object3D()
  #hitBoxes: HitBox[] = []

  readonly textMat = new TextMaterial({color: UI.text})
  readonly mutedMat = new TextMaterial({color: UI.muted})
  readonly cyanMat = new TextMaterial({color: UI.cyan})
  readonly greenMat = new TextMaterial({color: UI.green})
  readonly orangeMat = new TextMaterial({color: UI.orange})
  readonly redMat = new TextMaterial({color: UI.red})
  readonly blueMat = new TextMaterial({color: UI.blue})
  readonly violetMat = new TextMaterial({color: UI.violet})

  constructor() {
    this.#background = new Mesh(new PlaneGeometry({width: 1, height: 1}), new MeshBasicMaterial({color: UI.bg}))
    this.#background.position.z = -0.02
    this.node.add(this.#background)

    const borderMat = new MeshBasicMaterial({color: UI.border})
    this.#borderTop = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderBottom = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderLeft = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    this.#borderRight = new Mesh(new PlaneGeometry({width: 1, height: 1}), borderMat)
    for (const border of [this.#borderTop, this.#borderBottom, this.#borderLeft, this.#borderRight]) {
      border.position.z = -0.01
      this.node.add(border)
    }

    this.#layer.position.z = 0.004
    this.node.add(this.#layer)
  }

  attachCanvas(canvas: XrCanvas): void {
    this.canvas = canvas
  }

  setRect(rect: CardRect, pixelScale: number, font: TrueTypeFont): void {
    this.font = font
    this.pixelScale = pixelScale
    this.rectW = rect.w
    this.rectH = rect.h
    this.syncChrome()
    this.render()
  }

  onPointerMove(_event: MouseEvent, localX: number, localY: number): void {
    if (this.canvas === null) return
    const hit = this.#hitBoxes.find((box) => pointInBox(localX, localY, box))
    this.canvas.canvas.style.cursor = hit?.cursor ?? "default"
  }

  onPointerDown(_event: MouseEvent, localX: number, localY: number): void {
    const hit = this.#hitBoxes.find((box) => pointInBox(localX, localY, box))
    if (hit === undefined) return
    hit.action()
    this.canvas?.requestRender()
  }

  onDeactivate(): void {
    if (this.canvas !== null) this.canvas.canvas.style.cursor = "default"
  }

  dispose(): void {
    this.clearLayer()
  }

  protected abstract render(): void

  protected begin(): void {
    this.clearLayer()
    this.#hitBoxes = []
  }

  protected title(label: string, subtitle?: string): void {
    this.drawText(label, 12, 13, 13, this.cyanMat, Math.max(20, this.rectW * 0.45))
    if (subtitle !== undefined) this.drawText(subtitle, this.rectW - 190, 14, 11, this.mutedMat, 178)
    this.drawRect(12, 31, Math.max(1, this.rectW - 24), 1, UI.borderDim, -0.001)
  }

  protected drawText(value: string, x: number, y: number, fontPx: number, material: TextMaterial, maxWidthPx?: number): Text | null {
    if (this.font === null) return null
    const label = maxWidthPx === undefined ? value : fitText(value, maxWidthPx, fontPx)
    const t = new Text(label, this.font, fontPx * this.pixelScale, material)
    t.position.x = x * this.pixelScale
    t.position.y = -(y + fontPx) * this.pixelScale
    t.position.z = 0.002
    t.updateMatrix()
    this.#layer.add(t)
    return t
  }

  protected drawRect(x: number, y: number, w: number, h: number, color: Color, z = 0): Mesh {
    const mesh = new Mesh(
      new PlaneGeometry({width: Math.max(1, w) * this.pixelScale, height: Math.max(1, h) * this.pixelScale}),
      new MeshBasicMaterial({color}),
    )
    mesh.position.x = (x + w / 2) * this.pixelScale
    mesh.position.y = -(y + h / 2) * this.pixelScale
    mesh.position.z = z
    mesh.updateMatrix()
    this.#layer.add(mesh)
    return mesh
  }

  protected button(label: string, x: number, y: number, w: number, h: number, action: () => void, tone: BadgeKind = "neutral"): void {
    this.drawRect(x, y, w, h, toneFill(tone), 0)
    this.drawRect(x, y, w, 1, toneColor(tone), 0.001)
    this.drawRect(x, y + h - 1, w, 1, UI.borderDim, 0.001)
    this.drawRect(x, y, 1, h, UI.borderDim, 0.001)
    this.drawRect(x + w - 1, y, 1, h, UI.borderDim, 0.001)
    this.drawText(label, x + 8, y + Math.max(0, (h - 12) / 2 - 1), 12, toneText(tone, this), w - 12)
    this.hit(x, y, w, h, action, "pointer")
  }

  protected input(label: string, value: string, x: number, y: number, w: number, h: number, active: boolean, action: () => void): void {
    this.drawText(label, x, y - 16, 11, this.mutedMat, w)
    this.drawRect(x, y, w, h, active ? UI.bgHot : UI.input, 0)
    this.drawRect(x, y, w, 1, active ? UI.cyan : UI.borderDim, 0.001)
    this.drawRect(x, y + h - 1, w, 1, UI.borderDim, 0.001)
    this.drawRect(x, y, 1, h, UI.borderDim, 0.001)
    this.drawRect(x + w - 1, y, 1, h, UI.borderDim, 0.001)
    const suffix = active ? "|" : ""
    this.drawText(`${value}${suffix}`, x + 8, y + Math.max(0, (h - 12) / 2 - 1), 12, active ? this.textMat : this.mutedMat, w - 16)
    this.hit(x, y, w, h, action, "text")
  }

  protected badge(label: string, x: number, y: number, w: number, kind: BadgeKind): void {
    this.drawRect(x, y, w, 22, toneFill(kind), 0)
    this.drawRect(x, y, w, 1, toneColor(kind), 0.001)
    this.drawText(label, x + 7, y + 4, 11, toneText(kind, this), w - 12)
  }

  protected hit(x: number, y: number, w: number, h: number, action: () => void, cursor = "pointer"): void {
    this.#hitBoxes.push({x, y, w, h, action, cursor})
  }

  protected requestRender(): void {
    this.canvas?.requestRender()
  }

  protected clearLayer(): void {
    const renderer = this.canvas?.renderer
    for (const child of this.#layer.children) {
      const text = child as Text
      if (text.isText === true) {
        if (renderer !== undefined) {
          renderer.invalidateGeometry(text.stencilGeometry)
          renderer.invalidateGeometry(text.coverGeometry)
        }
        continue
      }
      const mesh = child as Mesh
      if (mesh.geometry !== undefined && renderer !== undefined) renderer.invalidateGeometry(mesh.geometry)
    }
    this.#layer.children = []
  }

  private syncChrome(): void {
    const ps = this.pixelScale
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    this.#background.geometry = new PlaneGeometry({width: w * ps, height: h * ps})
    this.#background.position.x = (w / 2) * ps
    this.#background.position.y = -(h / 2) * ps
    this.#background.updateMatrix()

    const bw = 2 * ps
    const ww = w * ps
    const hh = h * ps
    this.#borderTop.geometry = new PlaneGeometry({width: ww, height: bw})
    this.#borderTop.position.x = ww / 2
    this.#borderTop.position.y = -bw / 2
    this.#borderTop.updateMatrix()
    this.#borderBottom.geometry = new PlaneGeometry({width: ww, height: bw})
    this.#borderBottom.position.x = ww / 2
    this.#borderBottom.position.y = -hh + bw / 2
    this.#borderBottom.updateMatrix()
    this.#borderLeft.geometry = new PlaneGeometry({width: bw, height: hh})
    this.#borderLeft.position.x = bw / 2
    this.#borderLeft.position.y = -hh / 2
    this.#borderLeft.updateMatrix()
    this.#borderRight.geometry = new PlaneGeometry({width: bw, height: hh})
    this.#borderRight.position.x = ww - bw / 2
    this.#borderRight.position.y = -hh / 2
    this.#borderRight.updateMatrix()
  }
}

export class XrToolbarCard extends XrPanelCard {
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
    super()
    this.#actions = actions
  }

  setState(next: Partial<ToolbarState>): void {
    this.#state = {...this.#state, ...next}
    this.render()
    this.requestRender()
  }

  protected render(): void {
    this.begin()
    const h = Math.max(1, this.rectH)
    this.drawRect(0, 0, this.rectW, h, rgb(14, 18, 26, 0.98), -0.001)
    this.drawText("@metafor/bun-debug", 12, 13, 13, this.cyanMat, 160)
    let x = 176
    this.badge(`ws: ${this.#state.ws}`, x, 12, 114, this.#state.wsKind); x += 122
    this.badge(this.#state.connection, x, 12, 164, this.#state.connectionKind); x += 172
    this.badge(`run: ${this.#state.run}`, x, 12, 150, this.#state.runKind); x += 158
    this.drawText(this.#state.engine, x, 17, 11, this.mutedMat, 112); x += 120
    this.drawText(shortenUrl(this.#state.inspectorUrl), x, 17, 11, this.mutedMat, Math.max(80, this.rectW - x - 450))

    const y = 10
    const bw = 62
    let bx = this.rectW - 12 - 6 * (bw + 6) - 92
    if (bx < 12) bx = 12
    this.button(this.#state.verbose ? "Hide log" : "Verbose", bx, y, 86, 26, () => this.#actions.onToggleVerbose(), this.#state.verbose ? "paused" : "neutral")
    bx += 96
    this.button("Pause", bx, y, bw, 26, () => this.#actions.onPause(), "warn"); bx += bw + 6
    this.button("Resume", bx, y, bw + 12, 26, () => this.#actions.onResume(), "live"); bx += bw + 18
    this.button("Over", bx, y, bw, 26, () => this.#actions.onStep("over"), "neutral"); bx += bw + 6
    this.button("Into", bx, y, bw, 26, () => this.#actions.onStep("into"), "neutral"); bx += bw + 6
    this.button("Out", bx, y, bw, 26, () => this.#actions.onStep("out"), "neutral")
  }
}

export class XrFramesCard extends XrPanelCard {
  #frames: XrFrameSnapshot[] = []
  #active = 0
  #scroll = 0
  #onSelect: (index: number) => void

  constructor(onSelect: (index: number) => void) {
    super()
    this.#onSelect = onSelect
  }

  setFrames(frames: XrFrameSnapshot[], active: number): void {
    this.#frames = frames
    this.#active = active
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, frames.length - 1)))
    this.render()
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    this.#setScroll(this.#scroll + Math.trunc(delta))
  }

  protected render(): void {
    this.begin()
    this.title("Frames", `${this.#frames.length}`)
    const rowH = 24
    const y0 = 42
    const visible = Math.max(1, Math.floor((this.rectH - y0 - 12) / rowH))
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#frames.length - visible)))

    if (this.#frames.length === 0) {
      this.drawText("waiting for paused frame", 14, 48, 12, this.mutedMat, this.rectW - 28)
      return
    }

    for (let i = 0; i < visible; i++) {
      const frame = this.#frames[this.#scroll + i]
      if (frame === undefined) break
      const y = y0 + i * rowH
      const active = frame.index === this.#active
      if (active) this.drawRect(8, y - 2, this.rectW - 16, rowH, rgb(43, 73, 117, 0.95), 0)
      const fn = frame.function || "<anonymous>"
      const loc = frame.url ? `${shortenUrl(frame.url)}:${frame.line}` : `(scriptId ?):${frame.line}`
      this.drawText(`#${frame.index}`, 14, y + 4, 11, active ? this.orangeMat : this.mutedMat, 34)
      this.drawText(fn, 48, y + 3, 12, active ? this.textMat : this.textMat, this.rectW - 64)
      this.drawText(loc, 48, y + 15, 9, this.mutedMat, this.rectW - 64)
      this.hit(8, y - 2, this.rectW - 16, rowH, () => this.#onSelect(frame.index))
    }
  }

  #setScroll(next: number): void {
    const visible = Math.max(1, Math.floor((this.rectH - 54) / 24))
    const max = Math.max(0, this.#frames.length - visible)
    const clamped = Math.max(0, Math.min(max, next))
    if (clamped === this.#scroll) return
    this.#scroll = clamped
    this.render()
    this.requestRender()
  }
}

export class XrScopesEvalCard extends XrPanelCard {
  #frame: XrFrameSnapshot | null = null
  #scroll = 0
  #expr = localStorage.getItem("bd:eval:expr") ?? "data.patches[0].path"
  #output = ""
  #editingExpr = false
  #onEval: (expr: string, frame: number) => void

  constructor(onEval: (expr: string, frame: number) => void) {
    super()
    this.#onEval = onEval
  }

  setFrame(frame: XrFrameSnapshot | null): void {
    this.#frame = frame
    this.#scroll = 0
    this.render()
    this.requestRender()
  }

  setEvalOutput(output: string): void {
    this.#output = output
    this.render()
    this.requestRender()
  }

  onWheel(event: WheelEvent, _localX: number, localY: number): void {
    if (localY > this.#evalTop()) return
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    this.#setScroll(this.#scroll + Math.trunc(delta))
  }

  onKey(event: KeyboardEvent): void {
    if (!this.#editingExpr) return
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      this.#runEval()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      event.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        this.#expr += text
        localStorage.setItem("bd:eval:expr", this.#expr)
        this.render()
        this.requestRender()
      })
      return
    }
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#expr = this.#expr.slice(0, -1)
      localStorage.setItem("bd:eval:expr", this.#expr)
      this.render()
      this.requestRender()
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#expr += event.key
      localStorage.setItem("bd:eval:expr", this.#expr)
      this.render()
      this.requestRender()
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#editingExpr = false
    this.render()
  }

  protected render(): void {
    this.begin()
    this.title("Scopes / Eval", this.#frame === null ? undefined : `frame ${this.#frame.index}`)
    const evalTop = this.#evalTop()
    const rows = this.#scopeRows()
    const rowH = 17
    const visible = Math.max(1, Math.floor((evalTop - 44) / rowH))
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, rows.length - visible)))
    if (rows.length === 0) {
      this.drawText("no scopes for current frame", 14, 48, 12, this.mutedMat, this.rectW - 28)
    } else {
      for (let i = 0; i < visible; i++) {
        const row = rows[this.#scroll + i]
        if (row === undefined) break
        const y = 44 + i * rowH
        if (row.kind === "group") {
          this.drawText(row.label, 14, y, 11, this.orangeMat, this.rectW - 28)
        } else {
          this.drawText(row.name, 18, y, 11, this.cyanMat, this.rectW * 0.34)
          this.drawText(row.value, Math.max(120, this.rectW * 0.38), y, 11, row.material, this.rectW * 0.58)
        }
      }
    }

    this.drawRect(12, evalTop, this.rectW - 24, 1, UI.borderDim, 0)
    this.drawText("Eval on selected frame", 12, evalTop + 12, 11, this.mutedMat, 180)
    this.input("expression", this.#expr, 12, evalTop + 42, Math.max(40, this.rectW - 92), 28, this.#editingExpr, () => {
      this.#editingExpr = true
    })
    this.button("Run", this.rectW - 72, evalTop + 42, 60, 28, () => this.#runEval(), "live")
    const output = this.#output.length === 0 ? "Cmd/Ctrl+Enter runs eval" : this.#output
    this.drawText(output.replace(/\s+/g, " "), 12, evalTop + 82, 11, this.#output.length === 0 ? this.mutedMat : this.textMat, this.rectW - 24)
  }

  #evalTop(): number {
    return Math.max(128, this.rectH - 132)
  }

  #runEval(): void {
    const expr = this.#expr.trim()
    if (expr.length === 0) return
    this.#editingExpr = false
    this.#onEval(expr, this.#frame?.index ?? 0)
  }

  #setScroll(next: number): void {
    const rows = this.#scopeRows()
    const visible = Math.max(1, Math.floor((this.#evalTop() - 44) / 17))
    const max = Math.max(0, rows.length - visible)
    const clamped = Math.max(0, Math.min(max, next))
    if (clamped === this.#scroll) return
    this.#scroll = clamped
    this.render()
    this.requestRender()
  }

  #scopeRows(): Array<
    | {kind: "group"; label: string}
    | {kind: "prop"; name: string; value: string; material: TextMaterial}
  > {
    if (this.#frame === null) return []
    const out: Array<{kind: "group"; label: string} | {kind: "prop"; name: string; value: string; material: TextMaterial}> = []
    const groups: Array<[string, XrScopeSnapshot[]]> = [
      ["local", this.#frame.scopes.local],
      ["closure", this.#frame.scopes.closure],
    ]
    for (const [groupName, scopes] of groups) {
      for (const scope of scopes) {
        const count = Object.keys(scope.properties).length
        out.push({kind: "group", label: scope.name === undefined ? `${groupName} (${count})` : `${groupName} [${scope.name}] (${count})`})
        for (const [name, prop] of Object.entries(scope.properties)) {
          out.push({kind: "prop", name, value: formatValue(prop), material: this.#materialFor(prop)})
        }
      }
    }
    return out
  }

  #materialFor(prop: XrPropertySnapshot): TextMaterial {
    if (prop.type === "string") return this.greenMat
    if (prop.type === "number" || prop.type === "boolean") return this.orangeMat
    if (prop.type === "function") return this.violetMat
    if (prop.type === "object") return this.blueMat
    return this.textMat
  }
}

type VerboseEntry = {
  kind: "inspector" | "agent"
  ts: string
  name: string
  payload: string
}

export class XrVerboseCard extends XrPanelCard {
  #entries: VerboseEntry[] = []
  #scroll = 0
  #autoscroll = localStorage.getItem("bd:verbose:pin") !== "0"
  readonly #max = 1000

  append(kind: "inspector" | "agent", ts: string, name: string, payload: unknown): void {
    const safePayload = payload === undefined ? "" : truncateJson(payload, 220)
    this.#entries.push({kind, ts, name, payload: safePayload})
    while (this.#entries.length > this.#max) this.#entries.shift()
    if (this.#autoscroll) this.#scrollToBottom()
    this.render()
    this.requestRender()
  }

  clear(): void {
    this.#entries = []
    this.#scroll = 0
    this.render()
    this.requestRender()
  }

  onWheel(event: WheelEvent): void {
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 18
    this.#setScroll(this.#scroll + Math.trunc(delta))
  }

  protected render(): void {
    this.begin()
    this.title("Verbose", `${this.#entries.length}`)
    this.button("Clear", this.rectW - 138, 10, 58, 24, () => this.clear(), "neutral")
    this.button(this.#autoscroll ? "Auto" : "Manual", this.rectW - 74, 10, 62, 24, () => {
      this.#autoscroll = !this.#autoscroll
      localStorage.setItem("bd:verbose:pin", this.#autoscroll ? "1" : "0")
      if (this.#autoscroll) this.#scrollToBottom()
      this.render()
    }, this.#autoscroll ? "live" : "neutral")

    const y0 = 44
    const rowH = 18
    const visible = Math.max(1, Math.floor((this.rectH - y0 - 12) / rowH))
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, this.#entries.length - visible)))
    if (this.#entries.length === 0) {
      this.drawText("inspector and agent event stream", 14, 50, 12, this.mutedMat, this.rectW - 28)
      return
    }
    for (let i = 0; i < visible; i++) {
      const entry = this.#entries[this.#scroll + i]
      if (entry === undefined) break
      const y = y0 + i * rowH
      this.drawText(formatTimestamp(entry.ts), 14, y, 10, this.mutedMat, 64)
      this.drawText(entry.kind === "agent" ? `@${entry.name}` : entry.name, 80, y, 10, entry.kind === "agent" ? this.violetMat : this.cyanMat, 150)
      this.drawText(entry.payload, 236, y, 10, this.textMat, this.rectW - 248)
    }
  }

  #setScroll(next: number): void {
    const visible = Math.max(1, Math.floor((this.rectH - 56) / 18))
    const max = Math.max(0, this.#entries.length - visible)
    const clamped = Math.max(0, Math.min(max, next))
    if (clamped === this.#scroll) return
    this.#autoscroll = false
    localStorage.setItem("bd:verbose:pin", "0")
    this.#scroll = clamped
    this.render()
    this.requestRender()
  }

  #scrollToBottom(): void {
    const visible = Math.max(1, Math.floor((this.rectH - 56) / 18))
    this.#scroll = Math.max(0, this.#entries.length - visible)
  }
}

export class XrWelcomeCard extends XrPanelCard {
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
    super()
    this.#actions = actions
  }

  setState(next: WelcomeState): void {
    const wasEmpty = this.#command.length === 0
    this.#state = next
    if (this.#active !== "url") this.#url = next.inspectorUrl
    if (this.#active !== "command" && wasEmpty) this.#command = next.defaultCommand
    this.render()
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
    this.#active = null
    this.render()
  }

  protected render(): void {
    this.begin()
    this.title("WebGPU UI Debugger")
    const statusColor = this.#state.connectionState === "connected" ? this.greenMat
      : this.#state.connectionState === "connecting" ? this.cyanMat
      : this.redMat
    const error = this.#state.connectionError === null ? "" : ` (${this.#state.connectionError})`

    const pad = 18
    const gap = 16
    const contentW = Math.max(1, this.rectW - pad * 2)
    const statusH = 72
    this.drawRect(pad, 46, contentW, statusH, UI.bgElevated, 0)
    this.drawRect(pad, 46, 3, statusH, this.#state.connectionState === "connected" ? UI.green : UI.red, 0.001)
    this.drawText(`Inspector ${this.#state.connectionState}${error}`, pad + 16, 60, 14, statusColor, contentW - 32)
    this.drawText(`Target ${this.#state.targetStatus}`, pad + 16, 88, 12, this.mutedMat, contentW - 32)

    const panelY = 142
    const panelH = 222
    const leftW = Math.floor((contentW - gap) * 0.58)
    const rightW = contentW - gap - leftW
    const rightX = pad + leftW + gap
    this.drawRect(pad, panelY, leftW, panelH, rgb(14, 19, 28, 0.98), 0)
    this.drawRect(rightX, panelY, rightW, panelH, rgb(14, 19, 28, 0.98), 0)
    this.drawText("Target", pad + 14, panelY + 16, 13, this.orangeMat, leftW - 28)
    this.drawText("Inspector", rightX + 14, panelY + 16, 13, this.cyanMat, rightW - 28)

    this.input("command", this.#command, pad + 14, panelY + 62, leftW - 28, 34, this.#active === "command", () => {
      this.#active = "command"
    })
    this.button("Run target", pad + 14, panelY + 118, 104, 30, () => this.#actions.onRun(this.#command, this.#state.pauseOnStart), "live")
    this.button("Stop", pad + 128, panelY + 118, 64, 30, () => this.#actions.onStop(), "warn")
    this.button(this.#state.pauseOnStart ? "pause: on" : "pause: off", pad + 202, panelY + 118, 102, 30, () => {
      const next = !this.#state.pauseOnStart
      this.#state = {...this.#state, pauseOnStart: next}
      this.#actions.onPauseOnStart(next)
      this.render()
    }, this.#state.pauseOnStart ? "paused" : "neutral")
    this.drawText("Run uses the command exactly as typed.", pad + 14, panelY + 174, 11, this.mutedMat, leftW - 28)

    this.input("url", this.#url, rightX + 14, panelY + 62, rightW - 28, 34, this.#active === "url", () => {
      this.#active = "url"
    })
    this.button("Apply", rightX + 14, panelY + 118, 74, 30, () => this.#actions.onApplyInspector(this.#url), "neutral")
    this.drawText(`DevTools mirror`, rightX + 14, panelY + 174, 11, this.mutedMat, rightW - 28)
    this.drawText(`https://debug.bun.sh/#${this.#url.replace(/^wss?:\/\//, "")}`, rightX + 14, panelY + 194, 11, this.mutedMat, rightW - 28)

    const lowerY = panelY + panelH + 18
    this.drawRect(pad, lowerY, contentW, 82, rgb(14, 19, 28, 0.88), 0)
    this.badge("renderer: WebGPU", pad + 16, lowerY + 22, 140, "live")
    this.badge("layout: rects", pad + 168, lowerY + 22, 120, "live")
    this.badge("style: vision cards", pad + 302, lowerY + 22, 150, "paused")
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
    this.render()
    this.requestRender()
  }
}

function pointInBox(x: number, y: number, box: HitBox): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
}

function toneFill(kind: BadgeKind): Color {
  if (kind === "live") return rgb(21, 50, 37, 0.98)
  if (kind === "paused") return rgb(61, 45, 24, 0.98)
  if (kind === "warn") return rgb(58, 32, 28, 0.98)
  return UI.bgElevated
}

function toneColor(kind: BadgeKind): Color {
  if (kind === "live") return UI.green
  if (kind === "paused") return UI.orange
  if (kind === "warn") return UI.red
  return UI.border
}

function toneText(kind: BadgeKind, card: XrPanelCard): TextMaterial {
  if (kind === "live") return card.greenMat
  if (kind === "paused") return card.orangeMat
  if (kind === "warn") return card.redMat
  return card.textMat
}

function truncateJson(value: unknown, max: number): string {
  let text = ""
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}
