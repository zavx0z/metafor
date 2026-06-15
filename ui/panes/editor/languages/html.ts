import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeHtmlPattern} from "./pattern-highlighter.ts"

export function tokenizeHtml(lines: string[]): EditorTokens {
  return tokenizeHtmlPattern(lines)
}

export const htmlHighlighter: LanguageHighlighter = {
  id: "html",
  name: "HTML / CSS / JS / TS",
  extensions: ["html", "htm"],
  aliases: ["markup", "proposal"],
  tokenize: tokenizeHtml,
}
