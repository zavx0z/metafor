import {activeVscodeSyntaxTheme, resolveVscodeScopeColorHex} from "@metafor/elements"
import type {EditorTokens} from "../tokens.ts"
import {distributeRangeTokens, pushRange, type RangeToken} from "./range-tokens.ts"
import {type PatternTokenStream, tokenizePatternText} from "./pattern-engine.ts"
import {patternLanguages, type PatternLanguageId} from "./pattern-languages.ts"

const SCOPE_MAP: Record<string, readonly string[]> = {
  "at": ["punctuation.decorator", "keyword.operator"],
  "atrule": ["keyword.other", "keyword"],
  "attr-name": ["entity.other.attribute-name"],
  "attr-value": ["string"],
  "boolean": ["constant.language.boolean"],
  "builtin": ["support.type", "support.function"],
  "class-name": ["entity.name.type.class", "entity.name.type"],
  "comment": ["comment"],
  "constant": ["constant.other", "constant.language"],
  "decorator": ["meta.decorator", "punctuation.decorator"],
  "doctype": ["meta.tag.sgml.doctype"],
  "doctype-tag": ["keyword"],
  "entity": ["constant.character.entity"],
  "function": ["entity.name.function", "support.function"],
  "function-variable": ["entity.name.function", "support.function"],
  "generic": ["entity.name.type.class", "entity.name.type"],
  "generic-function": ["entity.name.function", "support.function"],
  "hashbang": ["comment"],
  "hex-color": ["constant.other.color"],
  "identifier": ["entity.name.type"],
  "important": ["keyword.other.important"],
  "inline-template": ["entity.name.function"],
  "keyword": ["keyword"],
  "name": ["entity.name.tag"],
  "number": ["constant.numeric"],
  "operator": ["keyword.operator"],
  "parameter": ["variable.parameter"],
  "property": ["variable.other.property", "support.variable.property"],
  "prolog": ["meta.tag.preprocessor"],
  "punctuation": ["punctuation.separator", "punctuation"],
  "regex": ["string.regexp"],
  "rule": ["keyword.other"],
  "selector": ["entity.other.attribute-name.class.css", "entity.name.tag"],
  "selector-function-argument": ["entity.other.attribute-name.class.css", "entity.name.tag"],
  "string": ["string"],
  "string-property": ["variable.other.property", "support.variable.property"],
  "tag": ["entity.name.tag"],
  "template-string": ["string.template", "string"],
  "url": ["string"],
  "variable": ["variable.other.readwrite", "variable"],
}

const CATEGORY_MAP: Record<string, string> = {
  "at": "p",
  "atrule": "k",
  "attr-name": "t",
  "attr-value": "s",
  "boolean": "k",
  "builtin": "t",
  "class-name": "t",
  "comment": "c",
  "constant": "n",
  "decorator": "t",
  "doctype": "k",
  "doctype-tag": "k",
  "entity": "n",
  "function": "f",
  "function-variable": "f",
  "generic": "t",
  "generic-function": "f",
  "hashbang": "c",
  "hex-color": "n",
  "identifier": "t",
  "important": "k",
  "inline-template": "f",
  "keyword": "k",
  "name": "t",
  "number": "n",
  "operator": "p",
  "parameter": "d",
  "property": "t",
  "prolog": "k",
  "punctuation": "p",
  "regex": "n",
  "rule": "k",
  "selector": "t",
  "selector-function-argument": "t",
  "string": "s",
  "string-property": "t",
  "tag": "k",
  "template-string": "s",
  "url": "s",
  "variable": "d",
}

const TEST_HELPER_FUNCTIONS = new Set([
  "afterAll", "afterEach", "beforeAll", "beforeEach", "describe", "expect",
  "it", "mock", "spyOn", "test",
])

export function tokenizePattern(lines: readonly string[], language: PatternLanguageId): EditorTokens {
  const source = lines.join("\n")
  return distributeRangeTokens(tokenizePatternRangeTokens(source, 0, language), lines)
}

export function tokenizePatternRangeTokens(source: string, base: number, language: PatternLanguageId): RangeToken[] {
  const grammar = patternLanguages[language]
  const tokens: RangeToken[] = []
  flattenPatternTokens(tokenizePatternText(source, grammar), base, undefined, tokens)
  if (language === "typescript" || language === "javascript") applySemanticIdentifierOverlays(source, base, tokens)
  return tokens
}

export function tokenizePatternRanges(source: string, base: number, language: PatternLanguageId, push: (s: number, e: number, c: string, bg?: string, fg?: string) => void): void {
  for (const token of tokenizePatternRangeTokens(source, base, language)) push(token.s, token.e, token.c, token.bg, token.fg)
}

function flattenPatternTokens(stream: PatternTokenStream, start: number, inheritedTypes: readonly string[] | undefined, out: RangeToken[]): number {
  if (typeof stream === "string") {
    pushPatternToken(out, start, start + stream.length, inheritedTypes, stream)
    return start + stream.length
  }
  if (Array.isArray(stream)) {
    let cursor = start
    for (const item of stream) cursor = flattenPatternTokens(item, cursor, inheritedTypes, out)
    return cursor
  }

  const types = stream.aliases === undefined ? [stream.type] : [stream.type, ...stream.aliases]
  return flattenPatternTokens(stream.content, start, types, out)
}

function pushPatternToken(out: RangeToken[], s: number, e: number, types: readonly string[] | undefined, text: string): void {
  if (types === undefined || e <= s) return
  const fg = colorForTypes(types)
  const bg = types.includes("hex-color") ? text : undefined
  pushRange(out, s, e, categoryForTypes(types), bg, fg)
}

function colorForTypes(types: readonly string[]): string | undefined {
  for (const type of types) {
    const color = resolveVscodeScopeColorHex(activeVscodeSyntaxTheme, SCOPE_MAP[type] ?? [type])
    if (color !== undefined) return color
  }
  return undefined
}

function categoryForTypes(types: readonly string[]): string {
  for (const type of types) {
    const category = CATEGORY_MAP[type]
    if (category !== undefined) return category
  }
  return "d"
}

function applySemanticIdentifierOverlays(source: string, base: number, tokens: RangeToken[]): void {
  const identRe = /[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*/gu
  for (const match of source.matchAll(identRe)) {
    const text = match[0]
    const start = base + (match.index ?? 0)
    const end = start + text.length
    if (hasTokenCovering(tokens, start, end)) continue
    if (TEST_HELPER_FUNCTIONS.has(text) || isFunctionLead(source, end)) {
      pushRange(tokens, start, end, "f", undefined, colorForTypes(["function"]))
    } else if (/^[A-Z]/.test(text)) {
      pushRange(tokens, start, end, "t", undefined, colorForTypes(["class-name"]))
    }
  }
}

function hasTokenCovering(tokens: readonly RangeToken[], start: number, end: number): boolean {
  return tokens.some((token) => token.s <= start && token.e >= end)
}

function isFunctionLead(source: string, start: number): boolean {
  let i = skipWhitespaceRight(source, start)
  if (source[i] === "(" || source[i] === "`") return true
  if (source[i] === "?" && source[i + 1] === "." && source[i + 2] === "(") return true
  if (source[i] !== "<") return false

  let angle = 0
  for (; i < source.length; i++) {
    const ch = source[i] ?? ""
    if (ch === "\"" || ch === "'" || ch === "`") {
      i = Math.max(i, scanQuoted(source, i, ch) - 1)
      continue
    }
    if (ch === "<") angle++
    else if (ch === ">") {
      angle--
      if (angle <= 0) return nextNonWhitespaceRight(source, i + 1) === "`"
    }
  }
  return false
}

function scanQuoted(source: string, start: number, quote: string): number {
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
    if (ch === quote) return i + 1
  }
  return source.length
}

function nextNonWhitespaceRight(source: string, start: number): string {
  return source[skipWhitespaceRight(source, start)] ?? ""
}

function skipWhitespaceRight(source: string, start: number): number {
  let i = start
  while (i < source.length && /\s/.test(source[i] ?? "")) i++
  return i
}
