import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizePattern} from "./pattern-highlighter.ts"

export function tokenizeHtml(lines: string[]): EditorTokens {
  return tokenizePattern(lines, "markup")
}

export const htmlHighlighter: LanguageHighlighter = {
  id: "html",
  name: "HTML / CSS / JS",
  extensions: ["html", "htm"],
  aliases: ["markup", "proposal"],
  tokenize: tokenizeHtml,
}
