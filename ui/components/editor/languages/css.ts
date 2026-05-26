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
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? ""
    for (const match of line.matchAll(hexRe)) {
      const s = match.index ?? 0
      const text = match[0]
      if (![4, 5, 7, 9].includes(text.length)) continue
      const token = findToken(tokens[lineIndex] ?? [], s, s + text.length)
      if (token !== undefined) token.bg = text
    }
  }
}

function findToken(tokens: readonly EditorToken[], s: number, e: number): EditorToken | undefined {
  return tokens.find((token) => token.s <= s && token.e >= e)
}
