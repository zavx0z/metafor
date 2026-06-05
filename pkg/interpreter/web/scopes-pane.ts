/**
 * Scopes pane на UiSurface-системе.
 *
 * Показывает текущие local/closure области и detail popup для значения.
 * Ввод выражений живёт в TerminalPane, чтобы пользователь работал с одним
 * терминальным контекстом вывода и команд.
 */

import {TextMaterial} from "@metafor/engine"
import {
  UiSurface, Z, div, palette, radii, uiIcons,
} from "@ui/elements"
import {
  Button as button,
  Divider as divider,
} from "@ui/components"
import {
  createEditorTokenMaterials,
  renderEditorTokenizedLine,
  resolveLanguageHighlighter,
  type EditorTokenMaterialMap,
  type EditorTokens,
} from "@ui/panes"
import type {FrameSnapshot, PropertySnapshot, ScopeSnapshot} from "./interpreter-ui.ts"
import {t} from "./i18n.ts"

const PAD_X = 14
const HEADER_Y = 12
const TITLE_FONT = 13
const SUBTITLE_FONT = 11
const DIVIDER_Y = 34
const SCOPE_LIST_TOP = 44
const SCOPE_ROW_H = 17
const SCOPE_LIST_BOTTOM_PAD = 10
const SCROLLBAR_W = 4
const DETAIL_LINE_H = 15
const DETAIL_FONT = 10
const DETAIL_BG_Z = Z.ELEMENT + 0.34
const DETAIL_TEXT_Z = Z.TEXT + 0.34
const ICON_BUTTON_RADIUS = 6

type ScopeRow =
  | {kind: "group"; label: string}
  | {kind: "prop"; id: string; name: string; value: string; material: TextMaterial; prop: PropertySnapshot}

type ScopeDetail = {
  id: string
  name: string
  prop: PropertySnapshot
}

export class ScopesPane extends UiSurface {
  #frame: FrameSnapshot | null = null
  #detail: ScopeDetail | null = null
  readonly #tokenMaterials: EditorTokenMaterialMap = createEditorTokenMaterials()

  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
  }

  setFrame(frame: FrameSnapshot | null): void {
    this.#frame = frame
    this.#detail = null
    this.requestRender()
  }

  protected render(): void {
    // Header.
    this.drawText(t("variables"), PAD_X, HEADER_Y, {
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

    const rows = this.#scopeRows()
    if (rows.length === 0) {
      this.drawText(t("noScopes"), PAD_X + 4, SCOPE_LIST_TOP + 4, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: this.rectW - PAD_X * 2 - 8,
      })
    } else {
      const listH = Math.max(1, this.rectH - SCOPE_LIST_TOP - SCOPE_LIST_BOTTOM_PAD)
      const contentMaxX = this.rectW - PAD_X - SCROLLBAR_W - 6
      div(this, PAD_X, SCOPE_LIST_TOP, this.rectW - PAD_X * 2, listH, {
        key: "interpreter:scopes:list",
        scrollContentHeight: Math.max(listH, rows.length * SCOPE_ROW_H),
        style: {
          background: null,
          borderColor: null,
          borderRadius: 0,
          padding: 0,
          overflowY: "auto",
        },
        children: (ctx) => {
          const start = Math.max(0, Math.floor(ctx.scrollTop / SCOPE_ROW_H) - 1)
          const end = Math.min(rows.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / SCOPE_ROW_H) + 1)
          for (let idx = start; idx < end; idx++) {
            const row = rows[idx]
            if (row === undefined) continue
            const rowY = SCOPE_LIST_TOP + idx * SCOPE_ROW_H - ctx.scrollTop
            if (row.kind === "group") this.#drawGroupRow(row, rowY, contentMaxX)
            else this.#drawPropRow(row, rowY, contentMaxX)
          }
        },
      })
    }

    this.#drawDetailPopup()
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
          const scopeName = scope.name ?? name
          out.push({
            kind: "prop",
            id: `${scopeName}\0${propName}`,
            name: propName,
            value: formatValue(prop),
            material: this.#materialFor(prop),
            prop,
          })
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

  #drawGroupRow(row: Extract<ScopeRow, {kind: "group"}>, rowY: number, contentMaxX: number): void {
    this.drawText(row.label, PAD_X + 4, rowY, {
      fontPx: 11,
      material: this.materials.orange,
      maxWidthPx: contentMaxX - (PAD_X + 4),
    })
  }

  #drawPropRow(row: Extract<ScopeRow, {kind: "prop"}>, rowY: number, contentMaxX: number): void {
    const rowX = PAD_X + 2
    const rowW = contentMaxX - rowX
    const active = this.#detail?.id === row.id
    const hit = this.hitState(rowX, rowY - 1, rowW, SCOPE_ROW_H, `scope-prop:${row.id}`)
    if (active || hit.hovered) {
      this.drawRoundedRect(rowX, rowY - 2, rowW, SCOPE_ROW_H, {
        radius: 5,
        fill: active ? palette.activeRowFill : palette.bgHot,
        border: active ? palette.border : null,
        borderWidth: active ? 1 : 0,
        opacity: active ? 0.72 : 0.42,
        z: Z.ELEMENT - 0.01,
      })
    }

    const nameMaxW = Math.floor((contentMaxX - PAD_X) * 0.42)
    const valueX = PAD_X + 4 + nameMaxW + 8
    const valueMaxW = contentMaxX - valueX
    this.drawText(row.name, PAD_X + 8, rowY, {
      fontPx: 11,
      material: this.materials.cyan,
      maxWidthPx: nameMaxW,
    })
    if (valueMaxW > 20) {
      this.drawText(row.value, valueX, rowY, {
        fontPx: 11,
        material: row.material,
        maxWidthPx: valueMaxW,
      })
    }

    this.hit(rowX, rowY - 1, rowW, SCOPE_ROW_H, () => {
      this.#detail = {id: row.id, name: row.name, prop: row.prop}
      this.requestRender()
    }, {
      key: `scope-prop:${row.id}`,
      cursor: "pointer",
    })
  }

  #drawDetailPopup(): void {
    const detail = this.#detail
    if (detail === null) return

    this.hit(0, 0, this.rectW, this.rectH, () => {
      this.#detail = null
      this.requestRender()
    }, {key: "scope-detail:backdrop", cursor: "default"})

    const w = Math.max(260, Math.min(620, this.rectW - PAD_X * 2))
    const h = Math.max(190, Math.min(360, this.rectH - 70))
    const x = Math.max(PAD_X, Math.round((this.rectW - w) / 2))
    const y = Math.max(42, Math.round((this.rectH - h) / 2) - 20)

    this.drawRoundedRect(x, y, w, h, {
      radius: 10,
      fill: palette.bgElevated,
      border: palette.border,
      borderWidth: 1,
      opacity: 0.98,
      z: DETAIL_BG_Z,
    })
    this.hit(x, y, w, h, () => {}, {key: "scope-detail:popup", cursor: "default"})

    this.drawText(t("scopeValue"), x + 14, y + 11, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: 120,
      z: DETAIL_TEXT_Z,
      clip: false,
    })
    this.drawText(detail.name, x + 14, y + 27, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: w - 74,
      z: DETAIL_TEXT_Z,
      clip: false,
    })
    button(this, x + w - 40, y + 12, 26, 24, {
      label: t("close"),
      iconSrc: uiIcons.stop,
      iconOnly: true,
      iconSizePx: 14,
      tooltip: t("close"),
      tooltipDelayMs: 180,
      variant: "outlined",
      radius: ICON_BUTTON_RADIUS,
      tone: "neutral",
      action: () => {
        this.#detail = null
        this.requestRender()
      },
    })

    const code = detailCode(detail)
    const contentX = x + 12
    const contentY = y + 54
    const contentW = w - 24
    const contentH = h - 66
    const lines = code.split("\n")
    const contentTextW = Math.max(contentW - 18, ...lines.map((line) => this.measureText(line, DETAIL_FONT))) + 18
    const tokens = resolveLanguageHighlighter({languageId: "typescript"}).tokenize(lines)

    this.drawRoundedRect(contentX, contentY, contentW, contentH, {
      radius: 7,
      fill: palette.bgCode,
      border: palette.borderDim,
      borderWidth: 1,
      z: DETAIL_BG_Z + 0.01,
    })
    div(this, contentX + 1, contentY + 1, contentW - 2, contentH - 2, {
      key: "interpreter:scope-detail:code",
      scrollContentWidth: contentTextW,
      scrollContentHeight: Math.max(contentH - 2, lines.length * DETAIL_LINE_H + 12),
      style: {
        background: null,
        borderColor: null,
        borderRadius: 0,
        padding: 0,
        overflowX: "auto",
        overflowY: "auto",
      },
      children: (ctx) => {
        const start = Math.max(0, Math.floor(ctx.scrollTop / DETAIL_LINE_H) - 1)
        const end = Math.min(lines.length, Math.ceil((ctx.scrollTop + ctx.viewportHeight) / DETAIL_LINE_H) + 1)
        for (let idx = start; idx < end; idx++) {
          const text = lines[idx] ?? ""
          const rowY = contentY + 7 + idx * DETAIL_LINE_H - ctx.scrollTop
          this.#drawHighlightedLine(text, tokens, idx, contentX + 9 - ctx.scrollLeft, rowY, contentTextW)
        }
      },
    })
  }

  #drawHighlightedLine(text: string, tokens: EditorTokens, lineIndex: number, x: number, y: number, maxW: number): void {
    renderEditorTokenizedLine({
      pane: this,
      text,
      tokens: tokens[lineIndex] ?? [],
      startX: x,
      y,
      fontPx: DETAIL_FONT,
      maxPx: maxW,
      materials: this.#tokenMaterials,
      fallbackMaterial: this.materials.text,
    })
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

function detailCode(detail: ScopeDetail): string {
  return formatScopeDetailCode(detail.name, detail.prop)
}

export function formatScopeDetailCode(rawName: string, prop: PropertySnapshot): string {
  const lines = [`${rawName}: ${interpreterValuePreview(prop)}`]
  const preview = previewPropertyLines(prop.preview)
  if (preview.length > 0) {
    lines.push("  [[Preview]]")
    for (const line of preview) lines.push(`    ${line}`)
  }

  const descriptor = descriptorLines(prop)
  if (descriptor.length > 0) {
    lines.push("  [[Descriptor]]")
    for (const line of descriptor) lines.push(`    ${line}`)
  }

  const remote = remoteLines(prop)
  if (remote.length > 0) {
    lines.push("  [[Remote]]")
    for (const line of remote) lines.push(`    ${line}`)
  }

  const source = functionSource(prop)
  if (source !== null) {
    lines.push("  [[FunctionSource]]")
    for (const line of source.split("\n")) lines.push(`    ${line}`)
  }

  return lines.join("\n")
}

function fullValue(prop: PropertySnapshot): unknown {
  if (prop.value !== undefined) return prop.value
  if (prop.description !== undefined) return prop.description
  if (prop.className !== undefined) return prop.className
  if (prop.type !== undefined) return prop.type
  return undefined
}

function stringifyFullData(value: unknown, depth = 0): string {
  const seen = new WeakSet<object>()
  return stringifyTsValue(value, depth, seen)
}

function stringifyTsValue(value: unknown, depth: number, seen: WeakSet<object>): string {
  const pad = "  ".repeat(depth)
  const nextPad = "  ".repeat(depth + 1)
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "string") return stringifyStringValue(value, depth, seen)
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value))
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "function") return String(value)
  if (typeof value !== "object") return JSON.stringify(String(value))
  if (seen.has(value)) return JSON.stringify("[Circular]")
  seen.add(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    const items = value.map((item) => `${nextPad}${stringifyTsValue(item, depth + 1, seen)}`)
    return `[\n${items.join(",\n")}\n${pad}]`
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return "{}"
  const body = entries.map(([key, item]) => (
    `${nextPad}${objectKey(key)}: ${stringifyTsValue(item, depth + 1, seen)}`
  ))
  return `{\n${body.join(",\n")}\n${pad}}`
}

function objectKey(name: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(name)) return name
  return JSON.stringify(name)
}

function interpreterValuePreview(prop: PropertySnapshot): string {
  const value = fullValue(prop)
  if (prop.type === "function" && typeof value === "string") {
    const source = normalizeProtocolString(value).trim()
    if (source.length > 0) return functionPreview(source)
  }
  if (prop.type === "string" && typeof value === "string") {
    return stringifyStringValue(value, 0, new WeakSet<object>())
  }
  if (prop.value !== undefined) return stringifyFullData(prop.value)
  if (prop.description !== undefined) {
    const normalized = normalizeProtocolString(prop.description).trim()
    const parsed = parseEmbeddedJson(normalized)
    if (parsed !== undefined) return stringifyFullData(parsed)
    return firstPreviewLine(normalized)
  }
  if (prop.className !== undefined) return prop.className
  if (prop.type !== undefined) return prop.type
  return "undefined"
}

function functionPreview(source: string): string {
  const first = firstPreviewLine(source)
  const decl = first.match(/^(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/)
  if (decl !== null) {
    const asyncPrefix = decl[1] === undefined ? "" : "async "
    const name = decl[2] === undefined ? "" : decl[2]
    return `${asyncPrefix}ƒ ${name}(${trimArgs(decl[3] ?? "")})`
  }
  const arrow = first.match(/^(async\s+)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/)
  if (arrow !== null) {
    const asyncPrefix = arrow[1] === undefined ? "" : "async "
    const args = arrow[2] ?? arrow[3] ?? ""
    return `${asyncPrefix}ƒ (${trimArgs(args)})`
  }
  const method = first.match(/^(async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/)
  if (method !== null) {
    const asyncPrefix = method[1] === undefined ? "" : "async "
    return `${asyncPrefix}ƒ ${method[2] ?? ""}(${trimArgs(method[3] ?? "")})`
  }
  return first.startsWith("ƒ ") ? first : `ƒ ${first}`
}

function trimArgs(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function firstPreviewLine(value: string): string {
  return formatPreviewText(value.split("\n")[0] ?? "")
}

function previewPropertyLines(preview: unknown): string[] {
  const root = asRecord(preview)
  if (root === null) return []
  const properties = Array.isArray(root["properties"]) ? root["properties"] : []
  const out: string[] = []
  for (const item of properties) {
    const prop = asRecord(item)
    if (prop === null) continue
    const name = typeof prop["name"] === "string" ? prop["name"] : undefined
    if (name === undefined) continue
    out.push(`${objectKey(name)}: ${previewPropertyValue(prop)}`)
  }
  if (root["overflow"] === true) out.push("…")
  return out
}

function previewPropertyValue(prop: Record<string, unknown>): string {
  const type = typeof prop["type"] === "string" ? prop["type"] : undefined
  const value = typeof prop["value"] === "string" ? prop["value"] : undefined
  const subtype = typeof prop["subtype"] === "string" ? prop["subtype"] : undefined
  if (type === "string") return JSON.stringify(value ?? "")
  if (type === "undefined") return "undefined"
  if (type === "number" || type === "boolean" || type === "bigint") return value ?? type
  if (type === "function" && value !== undefined) return functionPreview(normalizeProtocolString(value))
  if (subtype === "null") return "null"
  const nested = asRecord(prop["valuePreview"])
  if (nested !== null) return previewDescription(nested)
  return value ?? subtype ?? type ?? "unknown"
}

function previewDescription(preview: Record<string, unknown>): string {
  const description = typeof preview["description"] === "string" ? preview["description"] : undefined
  if (description !== undefined) return firstPreviewLine(normalizeProtocolString(description))
  const type = typeof preview["type"] === "string" ? preview["type"] : undefined
  return type ?? "Object"
}

function descriptorLines(prop: PropertySnapshot): string[] {
  const items: Array<[string, unknown]> = [
    ["enumerable", prop.enumerable],
    ["configurable", prop.configurable],
    ["writable", prop.writable],
    ["isOwn", prop.isOwn],
    ["wasThrown", prop.wasThrown],
  ]
  if (prop.get !== undefined) items.push(["get", interpreterValuePreview(prop.get)])
  if (prop.set !== undefined) items.push(["set", interpreterValuePreview(prop.set)])
  return items
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : stringifyFullData(value, 2)}`)
}

function remoteLines(prop: PropertySnapshot): string[] {
  const items: Array<[string, unknown]> = [
    ["type", prop.type],
    ["subtype", prop.subtype],
    ["className", prop.className],
    ["objectId", prop.objectId],
    ["unserializableValue", prop.unserializableValue],
  ]
  return items
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${stringifyFullData(value, 2)}`)
}

function functionSource(prop: PropertySnapshot): string | null {
  if (prop.type !== "function") return null
  const value = fullValue(prop)
  if (typeof value !== "string") return null
  const source = normalizeProtocolString(value).trim()
  if (source.length === 0) return null
  if (!source.includes("\n") && source.length <= 120) return null
  return source
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringifyStringValue(value: string, depth: number, seen: WeakSet<object>): string {
  const text = normalizeProtocolString(value)
  const parsed = parseEmbeddedJson(text)
  if (parsed !== undefined) return stringifyTsValue(parsed, depth, seen)
  if (text.includes("\n")) return `\`${escapeTemplateLiteral(text)}\``
  return JSON.stringify(text)
}

function normalizeProtocolString(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n")
  if (normalized.includes("\n") || !/\\[nrt"\\]/.test(normalized)) return normalized
  try {
    const parsed: unknown = JSON.parse(`"${normalized}"`)
    if (typeof parsed === "string") return parsed.replace(/\r\n?/g, "\n")
  } catch {
    // Fall through to conservative replacements below.
  }
  return normalized
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\t", "\t")
}

function parseEmbeddedJson(value: string): unknown {
  const trimmed = value.trim()
  if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
    return undefined
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

function escapeTemplateLiteral(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${")
}
