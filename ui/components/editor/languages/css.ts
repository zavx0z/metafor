import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {distributeRangeTokens, pushRange, type RangePush, type RangeToken} from "./range-tokens.ts"

const CSS_KEYWORD_VALUES = new Set([
  "auto", "none", "inherit", "initial", "unset", "block", "inline", "inline-block",
  "flex", "grid", "absolute", "relative", "fixed", "static", "sticky", "hidden",
  "visible", "bold", "normal", "italic", "underline", "center", "left", "right",
  "top", "bottom", "important", "transparent", "currentColor", "solid", "dashed",
  "pointer", "default", "wrap", "nowrap", "column", "row",
])

export function tokenizeCss(lines: string[]): EditorTokens {
  const source = lines.join("\n")
  const tokens: RangeToken[] = []
  tokenizeCssRanges(source, 0, (s, e, c, bg) => pushRange(tokens, s, e, c, bg))
  return distributeRangeTokens(tokens, lines)
}

export function tokenizeCssRanges(content: string, base: number, push: RangePush): void {
  const N = content.length
  let i = 0
  let mode: 0 | 1 | 2 = 0
  let braceDepth = 0

  while (i < N) {
    const ch = content[i]!

    if (ch === "/" && content[i + 1] === "*") {
      const end = content.indexOf("*/", i + 2)
      const stop = end === -1 ? N : end + 2
      push(base + i, base + stop, "c")
      i = stop
      continue
    }

    if (ch === "\"" || ch === "'") {
      const start = i
      const quote = ch
      i++
      while (i < N && content[i] !== quote) {
        if (content[i] === "\\" && i + 1 < N) i += 2
        else i++
      }
      if (i < N) i++
      push(base + start, base + i, "s")
      continue
    }

    if (ch === "{") {
      push(base + i, base + i + 1, "p")
      braceDepth++
      mode = 1
      i++
      continue
    }
    if (ch === "}") {
      push(base + i, base + i + 1, "p")
      braceDepth = Math.max(0, braceDepth - 1)
      mode = braceDepth === 0 ? 0 : 1
      i++
      continue
    }
    if (ch === ":" && mode === 1) {
      push(base + i, base + i + 1, "p")
      mode = 2
      i++
      continue
    }
    if (ch === ";") {
      push(base + i, base + i + 1, "p")
      mode = braceDepth === 0 ? 0 : 1
      i++
      continue
    }

    if (ch === "@") {
      const start = i
      i++
      while (i < N && /[a-zA-Z-]/.test(content[i] ?? "")) i++
      push(base + start, base + i, "k")
      continue
    }

    if (ch === "#" && /[0-9a-fA-F]/.test(content[i + 1] ?? "")) {
      const start = i
      i++
      while (i < N && /[0-9a-fA-F]/.test(content[i] ?? "")) i++
      const len = i - start - 1
      const hex = content.slice(start, i)
      const bg = len === 3 || len === 4 || len === 6 || len === 8 ? hex : undefined
      push(base + start, base + i, "n", bg)
      continue
    }

    if ((ch === "-" && /[0-9.]/.test(content[i + 1] ?? "")) || /[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(content[i + 1] ?? ""))) {
      const start = i
      if (ch === "-") i++
      while (i < N && /[0-9.]/.test(content[i] ?? "")) i++
      while (i < N && /[a-zA-Z%]/.test(content[i] ?? "")) i++
      push(base + start, base + i, "n")
      continue
    }

    if (/[a-zA-Z_.\-]/.test(ch)) {
      const start = i
      while (i < N && /[a-zA-Z0-9_\-.]/.test(content[i] ?? "")) i++
      const word = content.slice(start, i)
      if (mode === 0 || mode === 1) {
        push(base + start, base + i, "t")
      } else if (CSS_KEYWORD_VALUES.has(word)) {
        push(base + start, base + i, "k")
      } else {
        push(base + start, base + i, "d")
      }
      continue
    }

    i++
  }
}

export const cssHighlighter: LanguageHighlighter = {
  id: "css",
  name: "CSS",
  extensions: ["css"],
  aliases: ["style", "stylesheet"],
  tokenize: tokenizeCss,
}
