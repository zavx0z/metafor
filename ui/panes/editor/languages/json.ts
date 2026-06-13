import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeJsonPattern} from "./pattern-highlighter.ts"

export function tokenizeJson(lines: string[]): EditorTokens {
  return tokenizeJsonPattern(lines)
}

export const jsonHighlighter: LanguageHighlighter = {
  id: "json",
  name: "JSON",
  extensions: ["json"],
  aliases: ["json"],
  tokenize: tokenizeJson,
}
