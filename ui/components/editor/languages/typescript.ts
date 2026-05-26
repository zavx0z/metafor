import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizePattern, tokenizePatternRanges} from "./pattern-highlighter.ts"
import {distributeRangeTokens, pushRange, type RangeToken} from "./range-tokens.ts"

export function tokenizeTypeScript(lines: string[]): EditorTokens {
  return applySqlTemplateOverlays(tokenizePattern(lines, "typescript"), lines)
}

export const typescriptHighlighter: LanguageHighlighter = {
  id: "typescript",
  name: "TypeScript / JavaScript",
  extensions: ["ts", "mts", "cts", "js", "mjs", "cjs"],
  aliases: ["ts", "js", "javascript"],
  tokenize: tokenizeTypeScript,
}

type SqlTemplateRange = {
  start: number
  end: number
  contentStart: number
  contentEnd: number
}

function applySqlTemplateOverlays(base: EditorTokens, lines: readonly string[]): EditorTokens {
  const source = lines.join("\n")
  const templates = findSqlTemplateRanges(source)
  if (templates.length === 0) return base

  const offsets = lineOffsets(lines)
  const tokens: RangeToken[] = []
  for (let lineIndex = 0; lineIndex < base.length; lineIndex++) {
    const lineStart = offsets[lineIndex] ?? 0
    for (const token of base[lineIndex] ?? []) {
      const abs: RangeToken = {
        s: lineStart + token.s,
        e: lineStart + token.e,
        c: token.c as RangeToken["c"],
      }
      if (token.bg !== undefined) abs.bg = token.bg
      if (!templates.some((template) => rangesOverlap(abs.s, abs.e, template.start, template.end))) tokens.push(abs)
    }
  }

  for (const template of templates) {
    pushRange(tokens, template.start, template.start + 1, "p")
    if (template.contentEnd > template.contentStart) {
      tokenizePatternRanges(source.slice(template.contentStart, template.contentEnd), template.contentStart, "sql", (s, e, c, bg, fg) => pushRange(tokens, s, e, c, bg, fg))
    }
    if (template.end > template.contentEnd) pushRange(tokens, template.end - 1, template.end, "p")
  }

  return distributeRangeTokens(tokens, lines)
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

  let end = i + 1
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
