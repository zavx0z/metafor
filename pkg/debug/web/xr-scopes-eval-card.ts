/**
 * Scopes / Eval card на Card-системе.
 *
 * Верх — список scopes (group-headers + props). Низ — eval-секция: лейбл,
 * input expression, Run button, output. evalTop = граница между ними,
 * фиксированная относительно низа карточки.
 */

import {Color, TextMaterial} from "@metafor/engine"
import {Card, Z} from "./xr-card.ts"
import type {XrFrameSnapshot, XrPropertySnapshot, XrScopeSnapshot} from "./xr-debug-ui.ts"

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
  greenFill: rgb(21, 50, 37, 1),
  orange: rgb(255, 190, 111, 1),
  blue: rgb(92, 155, 255, 1),
  violet: rgb(197, 151, 255, 1),
  input: rgb(10, 14, 21, 0.98),
}

const PAD_X = 14
const HEADER_Y = 12
const TITLE_FONT = 13
const SUBTITLE_FONT = 11
const DIVIDER_Y = 34
const SCOPE_LIST_TOP = 44
const SCOPE_ROW_H = 17
const EVAL_HEIGHT = 124

type ScopeRow =
  | {kind: "group"; label: string}
  | {kind: "prop"; name: string; value: string; material: TextMaterial}

export class XrScopesEvalCard extends Card {
  #frame: XrFrameSnapshot | null = null
  #scroll = 0
  #expr = localStorage.getItem("bd:eval:expr") ?? "data.patches[0].path"
  #output = ""
  #editing = false
  readonly #onEval: (expr: string, frame: number) => void

  readonly #cyanMat = new TextMaterial({color: UI.cyan})
  readonly #mutedMat = new TextMaterial({color: UI.muted})
  readonly #textMat = new TextMaterial({color: UI.text})
  readonly #orangeMat = new TextMaterial({color: UI.orange})
  readonly #greenMat = new TextMaterial({color: UI.green})
  readonly #blueMat = new TextMaterial({color: UI.blue})
  readonly #violetMat = new TextMaterial({color: UI.violet})

  constructor(onEval: (expr: string, frame: number) => void) {
    super({bgColor: UI.bg, borderColor: null})
    this.#onEval = onEval
  }

  setFrame(frame: XrFrameSnapshot | null): void {
    this.#frame = frame
    this.#scroll = 0
    this.requestRender()
  }

  setEvalOutput(output: string): void {
    this.#output = output
    this.requestRender()
  }

  onWheel(event: WheelEvent, _localX: number, localY: number): void {
    if (localY > this.#evalTop()) return
    const delta = event.deltaMode === 1 ? event.deltaY : event.deltaY / 20
    const rows = this.#scopeRows()
    const visible = this.#visibleScopeRows()
    const max = Math.max(0, rows.length - visible)
    const next = Math.max(0, Math.min(max, this.#scroll + Math.trunc(delta)))
    if (next === this.#scroll) return
    this.#scroll = next
    this.requestRender()
  }

  onKey(event: KeyboardEvent): void {
    if (!this.#editing) return
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
        this.requestRender()
      })
      return
    }
    if (event.key === "Backspace") {
      event.preventDefault()
      this.#expr = this.#expr.slice(0, -1)
      localStorage.setItem("bd:eval:expr", this.#expr)
      this.requestRender()
      return
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      this.#expr += event.key
      localStorage.setItem("bd:eval:expr", this.#expr)
      this.requestRender()
    }
  }

  override onDeactivate(): void {
    super.onDeactivate()
    if (this.#editing) {
      this.#editing = false
      this.requestRender()
    }
  }

  protected render(): void {
    // Header.
    this.drawText("Scopes / Eval", PAD_X, HEADER_Y, {
      fontPx: TITLE_FONT,
      material: this.#cyanMat,
      maxWidthPx: this.rectW - PAD_X * 2 - 80,
    })
    if (this.#frame !== null) {
      const subtitle = `frame ${this.#frame.index}`
      const subW = this.measureText(subtitle, SUBTITLE_FONT)
      this.drawText(subtitle, this.rectW - PAD_X - subW, HEADER_Y + 2, {
        fontPx: SUBTITLE_FONT,
        material: this.#mutedMat,
      })
    }
    this.drawRect(PAD_X, DIVIDER_Y, this.rectW - PAD_X * 2, 1, UI.borderDim, Z.SEPARATOR)

    // Scopes list.
    const evalTop = this.#evalTop()
    const rows = this.#scopeRows()
    const visible = this.#visibleScopeRows()
    this.#scroll = Math.max(0, Math.min(this.#scroll, Math.max(0, rows.length - visible)))
    if (rows.length === 0) {
      this.drawText("no scopes for current frame", PAD_X + 4, SCOPE_LIST_TOP + 4, {
        fontPx: 12,
        material: this.#mutedMat,
        maxWidthPx: this.rectW - PAD_X * 2 - 8,
      })
    } else {
      for (let i = 0; i < visible; i++) {
        const row = rows[this.#scroll + i]
        if (row === undefined) break
        const y = SCOPE_LIST_TOP + i * SCOPE_ROW_H
        if (row.kind === "group") {
          this.drawText(row.label, PAD_X + 4, y, {
            fontPx: 11,
            material: this.#orangeMat,
            maxWidthPx: this.rectW - PAD_X * 2 - 8,
          })
        } else {
          const nameMaxW = Math.floor((this.rectW - PAD_X * 2) * 0.42)
          const valueX = PAD_X + 4 + nameMaxW + 8
          const valueMaxW = this.rectW - PAD_X - valueX
          this.drawText(row.name, PAD_X + 8, y, {
            fontPx: 11,
            material: this.#cyanMat,
            maxWidthPx: nameMaxW,
          })
          if (valueMaxW > 20) {
            this.drawText(row.value, valueX, y, {
              fontPx: 11,
              material: row.material,
              maxWidthPx: valueMaxW,
            })
          }
        }
      }
    }

    // Eval section.
    this.drawRect(PAD_X, evalTop, this.rectW - PAD_X * 2, 1, UI.borderDim, Z.SEPARATOR)
    const heading = this.#frame === null ? "Eval expression" : `Eval on frame ${this.#frame.index}`
    this.drawText(heading, PAD_X, evalTop + 12, {
      fontPx: 11,
      material: this.#mutedMat,
      maxWidthPx: this.rectW - PAD_X * 2,
    })

    const inputY = evalTop + 32
    const inputH = 28
    const runW = 60
    const inputW = this.rectW - PAD_X * 2 - runW - 8
    this.#input(this.#expr, PAD_X, inputY, inputW, inputH, this.#editing)
    this.#button("Run", PAD_X + inputW + 8, inputY, runW, inputH, "live", () => this.#runEval())

    const outputY = inputY + inputH + 8
    const outputText = this.#output.length === 0 ? "Cmd/Ctrl+Enter runs eval" : this.#output
    this.drawText(outputText.replace(/\s+/g, " "), PAD_X, outputY, {
      fontPx: 11,
      material: this.#output.length === 0 ? this.#mutedMat : this.#textMat,
      maxWidthPx: this.rectW - PAD_X * 2,
    })
  }

  #input(value: string, x: number, y: number, w: number, h: number, active: boolean): void {
    this.drawRect(x, y, w, h, active ? UI.bgHot : UI.input, Z.ELEMENT)
    this.drawRect(x, y, w, 1, active ? UI.cyan : UI.borderDim, Z.ELEMENT_RULE)
    this.drawRect(x, y + h - 1, w, 1, UI.borderDim, Z.ELEMENT_RULE)
    this.drawRect(x, y, 1, h, UI.borderDim, Z.ELEMENT_RULE)
    this.drawRect(x + w - 1, y, 1, h, UI.borderDim, Z.ELEMENT_RULE)
    const display = active ? `${value}|` : value
    this.drawText(display, x + 8, y + (h - 12) / 2, {
      fontPx: 12,
      material: active ? this.#textMat : this.#mutedMat,
      maxWidthPx: w - 16,
    })
    this.hit(x, y, w, h, () => {
      this.#editing = true
      this.requestRender()
    }, "text")
  }

  #button(label: string, x: number, y: number, w: number, h: number, kind: "live" | "neutral", action: () => void): void {
    const fill = kind === "live" ? UI.greenFill : UI.bgElevated
    const border = kind === "live" ? UI.green : UI.border
    this.drawRect(x, y, w, h, fill, Z.ELEMENT)
    this.drawRect(x, y, w, 1, border, Z.ELEMENT_RULE)
    this.drawRect(x, y + h - 1, w, 1, UI.border, Z.ELEMENT_RULE)
    this.drawRect(x, y, 1, h, UI.border, Z.ELEMENT_RULE)
    this.drawRect(x + w - 1, y, 1, h, UI.border, Z.ELEMENT_RULE)
    const labelW = this.measureText(label, 12)
    this.drawText(label, x + (w - labelW) / 2, y + (h - 12) / 2, {
      fontPx: 12,
      material: kind === "live" ? this.#greenMat : this.#textMat,
      maxWidthPx: w - 6,
    })
    this.hit(x, y, w, h, action)
  }

  #evalTop(): number {
    return Math.max(SCOPE_LIST_TOP + SCOPE_ROW_H, this.rectH - EVAL_HEIGHT)
  }

  #visibleScopeRows(): number {
    return Math.max(1, Math.floor((this.#evalTop() - SCOPE_LIST_TOP - 4) / SCOPE_ROW_H))
  }

  #runEval(): void {
    const expr = this.#expr.trim()
    if (expr.length === 0) return
    this.#editing = false
    this.#onEval(expr, this.#frame?.index ?? 0)
  }

  #scopeRows(): ScopeRow[] {
    if (this.#frame === null) return []
    const out: ScopeRow[] = []
    const groups: Array<[string, XrScopeSnapshot[]]> = [
      ["local", this.#frame.scopes.local],
      ["closure", this.#frame.scopes.closure],
    ]
    for (const [name, scopes] of groups) {
      for (const scope of scopes) {
        const count = Object.keys(scope.properties).length
        out.push({
          kind: "group",
          label: scope.name === undefined ? `${name} (${count})` : `${name} [${scope.name}] (${count})`,
        })
        for (const [propName, prop] of Object.entries(scope.properties)) {
          out.push({kind: "prop", name: propName, value: formatValue(prop), material: this.#materialFor(prop)})
        }
      }
    }
    return out
  }

  #materialFor(prop: XrPropertySnapshot): TextMaterial {
    if (prop.type === "string") return this.#greenMat
    if (prop.type === "number" || prop.type === "boolean") return this.#orangeMat
    if (prop.type === "function") return this.#violetMat
    if (prop.type === "object") return this.#blueMat
    return this.#textMat
  }
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
