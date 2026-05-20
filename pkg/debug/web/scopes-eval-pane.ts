/**
 * Scopes / Eval pane на UiSurface-системе. Controls — из @metafor/components.
 *
 * Верх — список scopes (group-headers + props). Низ — eval-секция: лейбл,
 * input expression, Run button, output. evalTop = граница между ними,
 * фиксированная относительно низа pane.
 */

import {TextMaterial} from "@metafor/engine"
import {
  UiSurface, palette, radii, uiIcons,
} from "@metafor/elements"
import {
  Button as button, TextField as input, Divider as divider, scrollList,
  ScrollListState,
} from "@metafor/components"
import type {FrameSnapshot, PropertySnapshot, ScopeSnapshot} from "./debug-ui.ts"
import {t} from "./i18n.ts"

const PAD_X = 14
const HEADER_Y = 12
const TITLE_FONT = 13
const SUBTITLE_FONT = 11
const DIVIDER_Y = 34
const SCOPE_LIST_TOP = 44
const SCOPE_ROW_H = 17
const EVAL_HEIGHT = 124
const SCROLLBAR_W = 4
const WHEEL_SPEED = 1.6
const WHEEL_START_BOOST_PX = 16

type ScopeRow =
  | {kind: "group"; label: string}
  | {kind: "prop"; name: string; value: string; material: TextMaterial}

export class ScopesEvalPane extends UiSurface {
  #frame: FrameSnapshot | null = null
  readonly #list: ScrollListState
  #expr = localStorage.getItem("bd:eval:expr") ?? "data.patches[0].path"
  #output = ""
  #editing = false
  readonly #onEval: (expr: string, frame: number) => void

  constructor(onEval: (expr: string, frame: number) => void) {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.#list = new ScrollListState({onChange: () => this.requestRender()})
    this.#onEval = onEval
  }

  setFrame(frame: FrameSnapshot | null): void {
    this.#frame = frame
    this.#list.reset()
    this.requestRender()
  }

  setEvalOutput(output: string): void {
    this.#output = output
    this.requestRender()
  }

  onWheel(event: WheelEvent, _localX: number, localY: number): void {
    if (localY > this.#evalTop()) return
    const total = this.#scopeRows().length
    const visible = this.#visibleScopeRows()
    this.#list.applyWheel(event, SCOPE_ROW_H, total, visible, {
      speed: WHEEL_SPEED,
      startBoostPx: WHEEL_START_BOOST_PX,
    })
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
    this.drawText(t("scopesEval"), PAD_X, HEADER_Y, {
      fontPx: TITLE_FONT,
      material: this.materials.cyan,
      maxWidthPx: this.rectW - PAD_X * 2 - 80,
    })
    if (this.#frame !== null) {
      const subtitle = `frame ${this.#frame.index}`
      const subW = this.measureText(subtitle, SUBTITLE_FONT)
      this.drawText(subtitle, this.rectW - PAD_X - subW, HEADER_Y + 2, {
        fontPx: SUBTITLE_FONT,
        material: this.materials.muted,
      })
    }
    divider(this, PAD_X, DIVIDER_Y, this.rectW - PAD_X * 2)

    // Scopes list.
    const evalTop = this.#evalTop()
    const rows = this.#scopeRows()
    const visible = this.#visibleScopeRows()
    this.#list.clamp(rows.length, visible)
    if (rows.length === 0) {
      this.drawText(t("noScopes"), PAD_X + 4, SCOPE_LIST_TOP + 4, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD_X * 2 - 8,
      })
    } else {
      const listH = evalTop - SCOPE_LIST_TOP
      const contentMaxX = this.rectW - PAD_X - SCROLLBAR_W - 6
      scrollList(this, {
        state: this.#list,
        items: rows,
        rowH: SCOPE_ROW_H,
        x: PAD_X,
        y: SCOPE_LIST_TOP,
        w: this.rectW - PAD_X * 2,
        h: listH,
        scrollbarWidth: SCROLLBAR_W,
        scrollbarGap: 6,
        drawRow: (row, _idx, _x, y) => {
          if (row.kind === "group") {
            this.drawText(row.label, PAD_X + 4, y, {
              fontPx: 11,
              material: this.materials.orange,
              maxWidthPx: contentMaxX - (PAD_X + 4),
            })
          } else {
            const nameMaxW = Math.floor((contentMaxX - PAD_X) * 0.42)
            const valueX = PAD_X + 4 + nameMaxW + 8
            const valueMaxW = contentMaxX - valueX
            this.drawText(row.name, PAD_X + 8, y, {
              fontPx: 11,
              material: this.materials.cyan,
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
        },
      })
    }

    // Eval section.
    divider(this, PAD_X, evalTop, this.rectW - PAD_X * 2)
    const heading = this.#frame === null ? t("evalExpression") : `${t("evalFrame")} ${this.#frame.index}`
    this.drawText(heading, PAD_X, evalTop + 12, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: this.rectW - PAD_X * 2,
    })

    const inputY = evalTop + 32
    const inputH = 28
    const runW = 38
    const inputW = this.rectW - PAD_X * 2 - runW - 8
    input(this, PAD_X, inputY, inputW, inputH, {
      value: this.#expr,
      active: this.#editing,
      fontPx: 12,
      onActivate: () => {
        this.#editing = true
        this.requestRender()
      },
    })
    button(this, PAD_X + inputW + 8, inputY, runW, inputH, {
      label: t("runEval"), iconSrc: uiIcons.eval, iconOnly: true, tooltip: t("runEval"), tone: "live", action: () => this.#runEval(),
    })

    const outputY = inputY + inputH + 8
    const outputText = this.#output.length === 0 ? `${t("runEval")}: Cmd/Ctrl+Enter` : this.#output
    this.drawText(outputText.replace(/\s+/g, " "), PAD_X, outputY, {
      fontPx: 11,
      material: this.#output.length === 0 ? this.materials.muted : this.materials.text,
      maxWidthPx: this.rectW - PAD_X * 2,
    })
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
    const groups: Array<[string, ScopeSnapshot[]]> = [
      [t("local"), this.#frame.scopes.local],
      [t("closure"), this.#frame.scopes.closure],
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

  #materialFor(prop: PropertySnapshot): TextMaterial {
    if (prop.type === "string") return this.materials.green
    if (prop.type === "number" || prop.type === "boolean") return this.materials.orange
    if (prop.type === "function") return this.materials.violet
    if (prop.type === "object") return this.materials.blue
    return this.materials.text
  }
}

function formatValue(v: PropertySnapshot): string {
  if (v.value !== undefined) {
    if (typeof v.value === "string") return JSON.stringify(v.value)
    return formatPreviewText(String(v.value))
  }
  if (v.description !== undefined) return formatPreviewText(String(v.description))
  if (v.className !== undefined) return formatPreviewText(v.className)
  if (v.type !== undefined) return formatPreviewText(v.type)
  return "?"
}

function formatPreviewText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
