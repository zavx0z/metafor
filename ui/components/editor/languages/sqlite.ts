import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizePattern, tokenizePatternRanges} from "./pattern-highlighter.ts"

export function tokenizeSqlite(lines: string[]): EditorTokens {
  return tokenizePattern(lines, "sql")
}

export {tokenizePatternRanges as tokenizeSqliteRanges}

export const sqliteHighlighter: LanguageHighlighter = {
  id: "sqlite",
  name: "SQLite",
  extensions: ["sql", "sqlite"],
  aliases: ["sql", "sqlite"],
  tokenize: tokenizeSqlite,
}
