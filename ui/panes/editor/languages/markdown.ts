import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeMarkdownPattern} from "./pattern-highlighter.ts"

export function tokenizeMarkdown(lines: string[]): EditorTokens {
  return tokenizeMarkdownPattern(lines)
}

export const markdownHighlighter: LanguageHighlighter = {
  id: "markdown",
  name: "Markdown",
  extensions: ["md", "markdown"],
  aliases: ["md"],
  tokenize: tokenizeMarkdown,
}
