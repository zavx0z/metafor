import type {EditorToken, EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizePattern} from "./pattern-highlighter.ts"

export function tokenizeCss(lines: string[]): EditorTokens {
  const tokens = tokenizePattern(lines, "css")
  applyCssColorSwatches(lines, tokens)
  return tokens
}

export const cssHighlighter: LanguageHighlighter = {
  id: "css",
  name: "CSS",
  extensions: ["css"],
  aliases: ["style", "stylesheet"],
  tokenize: tokenizeCss,
}

function applyCssColorSwatches(lines: readonly string[], tokens: EditorTokens): void {
  const colorRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*(?:(?:[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?)\s*(?:,\s*|\s+)){2}[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?(?:\s*(?:,\s*|\/\s*)[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?)?\s*\)/gi
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ""
    for (const match of line.matchAll(colorRe)) {
      const s = match.index ?? 0
      const text = match[0]
      if (text.startsWith("#") && ![4, 5, 7, 9].includes(text.length)) continue
      const tokenEnd = text.startsWith("#") ? s + text.length : s + (text.toLowerCase().startsWith("rgba") ? 4 : 3)
      const token = findToken(tokens[lineIndex] ?? [], s, tokenEnd)
      if (token !== undefined) token.bg = text
    }
  }
}

function findToken(tokens: readonly EditorToken[], s: number, e: number): EditorToken | undefined {
  return tokens.find((token) => token.s <= s && token.e >= e)
}
