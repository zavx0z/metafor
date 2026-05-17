import type {EditorToken, EditorTokens, LanguageHighlighter} from "../tokens.ts"

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class",
  "const", "constructor", "continue", "debugger", "declare", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in",
  "infer", "instanceof", "interface", "is", "keyof", "let", "module",
  "namespace", "new", "null", "of", "package", "private", "protected",
  "public", "readonly", "return", "satisfies", "set", "static", "super",
  "switch", "symbol", "this", "throw", "true", "try", "type", "typeof",
  "undefined", "unique", "unknown", "var", "void", "while", "with", "yield",
])

const IDENT_RE = /[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*/uy
const NUMBER_RE = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?n?)/y

export function tokenizeTypeScript(lines: string[]): EditorTokens {
  const out: EditorTokens = lines.map(() => [])
  let inBlockComment = false
  let inTemplate = false

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ""
    const tokens = out[lineIndex]
    if (tokens === undefined) continue

    let i = 0
    while (i < line.length) {
      if (inBlockComment) {
        const end = line.indexOf("*/", i)
        if (end < 0) {
          push(tokens, i, line.length, "c")
          i = line.length
          continue
        }
        push(tokens, i, end + 2, "c")
        i = end + 2
        inBlockComment = false
        continue
      }

      if (inTemplate) {
        const end = scanQuoted(line, i, "`")
        push(tokens, i, end, "s")
        inTemplate = end > line.length
        i = Math.min(end, line.length)
        continue
      }

      const ch = line[i] ?? ""
      const next = line[i + 1] ?? ""

      if (isWhitespace(ch)) {
        i++
        continue
      }

      if (ch === "/" && next === "/") {
        push(tokens, i, line.length, "c")
        break
      }
      if (ch === "/" && next === "*") {
        const end = line.indexOf("*/", i + 2)
        if (end < 0) {
          push(tokens, i, line.length, "c")
          inBlockComment = true
          break
        }
        push(tokens, i, end + 2, "c")
        i = end + 2
        continue
      }

      if (ch === "\"" || ch === "'") {
        const end = Math.min(scanQuoted(line, i, ch), line.length)
        push(tokens, i, end, "s")
        i = end
        continue
      }
      if (ch === "`") {
        const end = scanQuoted(line, i, "`")
        push(tokens, i, Math.min(end, line.length), "s")
        inTemplate = end > line.length
        i = Math.min(end, line.length)
        continue
      }

      NUMBER_RE.lastIndex = i
      const numberMatch = NUMBER_RE.exec(line)
      if (numberMatch !== null && numberMatch.index === i) {
        const end = i + numberMatch[0].length
        push(tokens, i, end, "n")
        i = end
        continue
      }

      IDENT_RE.lastIndex = i
      const identMatch = IDENT_RE.exec(line)
      if (identMatch !== null && identMatch.index === i) {
        const text = identMatch[0]
        const end = i + text.length
        const kind = classifyIdentifier(text, nextNonWhitespace(line, end))
        push(tokens, i, end, kind)
        i = end
        continue
      }

      push(tokens, i, i + 1, "p")
      i++
    }
  }

  return out
}

export const typescriptHighlighter: LanguageHighlighter = {
  id: "typescript",
  name: "TypeScript / JavaScript",
  extensions: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
  aliases: ["ts", "tsx", "js", "jsx", "javascript"],
  tokenize: tokenizeTypeScript,
}

function push(tokens: EditorToken[], s: number, e: number, c: string): void {
  if (e <= s) return
  tokens.push({s, e, c})
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r"
}

function scanQuoted(line: string, start: number, quote: string): number {
  let escaped = false
  for (let i = start + 1; i < line.length; i++) {
    const ch = line[i] ?? ""
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === quote) return i + 1
  }
  return line.length + 1
}

function nextNonWhitespace(line: string, start: number): string {
  for (let i = start; i < line.length; i++) {
    const ch = line[i] ?? ""
    if (!isWhitespace(ch)) return ch
  }
  return ""
}

function classifyIdentifier(text: string, next: string): string {
  if (KEYWORDS.has(text)) return "k"
  if (next === "(") return "f"
  if (/^[A-Z]/.test(text)) return "t"
  return "d"
}
