import {tokenizePattern, tokenizePatternRangeTokens} from "@metafor/components/syntax"

export type TokenCategory =
  | "k"  // keyword
  | "s"  // string literal / template
  | "n"  // number / bigint / regex
  | "c"  // comment
  | "t"  // type-like identifier
  | "f"  // function-call identifier
  | "p"  // punctuation / operator
  | "d"  // default identifier

export type Token = {
  s: number
  e: number
  c: TokenCategory
  fg?: string
  bg?: string
}

export type SourceTokens = Token[][]

type SyntaxLanguage = "typescript" | "javascript" | "markup" | "css" | "sql"

export function tokenizeSource(source: string, opts: {path?: string} = {}): SourceTokens {
  return isSqlitePath(opts.path) ? tokenizePatternSource(source, "sql") : tokenize(source)
}

export function tokenize(source: string): SourceTokens {
  const lines = source.split("\n")
  const offsets = lineOffsets(lines)
  return applySqlTemplateOverlays(tokenizePatternSource(source, "typescript"), lines, offsets, source)
}

function tokenizePatternSource(source: string, language: SyntaxLanguage): SourceTokens {
  return tokenizePattern(source.split("\n"), language).map((line) => line.map((token) => {
    const out: Token = {s: token.s, e: token.e, c: normalizeCategory(token.c)}
    if (token.fg !== undefined) out.fg = token.fg
    if (token.bg !== undefined) out.bg = token.bg
    return out
  }))
}

function tokenizePatternAbsoluteRanges(
  source: string,
  base: number,
  language: SyntaxLanguage,
  push: (token: Token) => void,
): void {
  for (const token of tokenizePatternRangeTokens(source, base, language)) {
    const out: Token = {s: token.s, e: token.e, c: normalizeCategory(token.c)}
    if (token.fg !== undefined) out.fg = token.fg
    if (token.bg !== undefined) out.bg = token.bg
    push(out)
  }
}

function normalizeCategory(category: string): TokenCategory {
  if (
    category === "k" ||
    category === "s" ||
    category === "n" ||
    category === "c" ||
    category === "t" ||
    category === "f" ||
    category === "p" ||
    category === "d"
  ) return category
  return "d"
}

function pushSpan(
  result: SourceTokens,
  lines: string[],
  offsets: number[],
  start: number,
  end: number,
  category: TokenCategory,
  fg?: string,
  bg?: string,
): void {
  let lineIndex = upperBound(offsets, start) - 1
  if (lineIndex < 0) lineIndex = 0

  let cursor = start
  while (cursor < end && lineIndex < lines.length) {
    const lineStart = offsets[lineIndex] ?? 0
    const lineLen = lines[lineIndex]?.length ?? 0
    const lineEnd = lineStart + lineLen
    const spanEnd = Math.min(end, lineEnd)
    const sCol = cursor - lineStart
    const eCol = spanEnd - lineStart
    if (eCol > sCol) {
      const bucket = result[lineIndex]
      if (bucket !== undefined) {
        const token: Token = {s: sCol, e: eCol, c: category}
        if (fg !== undefined) token.fg = fg
        if (bg !== undefined) token.bg = bg
        bucket.push(token)
      }
    }
    cursor = spanEnd + 1
    lineIndex++
  }
}

function upperBound(arr: number[], value: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((arr[mid] ?? 0) <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}

type SqlTemplateRange = {
  start: number
  end: number
  contentStart: number
  contentEnd: number
}

function applySqlTemplateOverlays(base: SourceTokens, lines: string[], offsets: number[], source: string): SourceTokens {
  const templates = findSqlTemplateRanges(source)
  if (templates.length === 0) return base

  const absTokens: Token[] = []
  for (let lineIndex = 0; lineIndex < base.length; lineIndex++) {
    const lineStart = offsets[lineIndex] ?? 0
    for (const token of base[lineIndex] ?? []) {
      const absStart = lineStart + token.s
      const absEnd = lineStart + token.e
      if (templates.some((template) => rangesOverlap(absStart, absEnd, template.start, template.end))) continue

      const absToken: Token = {s: absStart, e: absEnd, c: token.c}
      if (token.fg !== undefined) absToken.fg = token.fg
      if (token.bg !== undefined) absToken.bg = token.bg
      absTokens.push(absToken)
    }
  }

  for (const template of templates) {
    absTokens.push({s: template.start, e: template.start + 1, c: "p"})
    tokenizePatternAbsoluteRanges(
      source.slice(template.contentStart, template.contentEnd),
      template.contentStart,
      "sql",
      (token) => absTokens.push(token),
    )
    if (template.end > template.contentEnd) absTokens.push({s: template.end - 1, e: template.end, c: "p"})
  }

  return distributeAbsoluteTokens(absTokens, lines, offsets)
}

function distributeAbsoluteTokens(tokens: Token[], lines: string[], offsets: number[]): SourceTokens {
  const result: SourceTokens = lines.map(() => [])
  for (const token of tokens.sort((a, b) => a.s - b.s || a.e - b.e)) {
    pushSpan(result, lines, offsets, token.s, token.e, token.c, token.fg, token.bg)
  }
  return result
}

function findSqlTemplateRanges(source: string): SqlTemplateRange[] {
  const ranges: SqlTemplateRange[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== "`") {
      i++
      continue
    }
    const end = scanTemplateEnd(source, i)
    if (isSqlTaggedTemplateStart(source, i)) {
      ranges.push({
        start: i,
        end,
        contentStart: i + 1,
        contentEnd: Math.max(i + 1, end - 1),
      })
    }
    i = Math.max(i + 1, end)
  }
  return ranges
}

function scanTemplateEnd(source: string, start: number): number {
  let escaped = false
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i] ?? ""
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === "`") return i + 1
  }
  return source.length
}

function isSqlTaggedTemplateStart(source: string, templateStart: number): boolean {
  let i = skipWhitespaceLeft(source, templateStart - 1)
  if (source[i] === ">") i = skipTypeArgumentsLeft(source, i)
  i = skipWhitespaceLeft(source, i)

  const end = i + 1
  while (i >= 0 && /[$_\p{ID_Continue}]/u.test(source[i] ?? "")) i--
  const ident = source.slice(i + 1, end)
  return ident.toLowerCase() === "sql"
}

function skipTypeArgumentsLeft(source: string, start: number): number {
  let angle = 0
  let brace = 0
  let bracket = 0
  let paren = 0
  for (let i = start; i >= 0; i--) {
    const ch = source[i] ?? ""
    if (ch === ">") angle++
    else if (ch === "<") {
      angle--
      if (angle <= 0 && brace === 0 && bracket === 0 && paren === 0) return i - 1
    } else if (ch === "}") brace++
    else if (ch === "{") brace = Math.max(0, brace - 1)
    else if (ch === "]") bracket++
    else if (ch === "[") bracket = Math.max(0, bracket - 1)
    else if (ch === ")") paren++
    else if (ch === "(") paren = Math.max(0, paren - 1)
  }
  return start
}

function skipWhitespaceLeft(source: string, start: number): number {
  let i = start
  while (i >= 0 && /\s/.test(source[i] ?? "")) i--
  return i
}

function lineOffsets(lines: readonly string[]): number[] {
  const offsets = new Array<number>(lines.length + 1)
  offsets[0] = 0
  for (let i = 0; i < lines.length; i++) offsets[i + 1] = offsets[i]! + (lines[i]?.length ?? 0) + 1
  return offsets
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function isSqlitePath(path: string | undefined): boolean {
  if (path === undefined) return false
  const clean = path.split("?")[0]?.split("#")[0] ?? path
  return clean.endsWith(".sql") || clean.endsWith(".sqlite")
}
