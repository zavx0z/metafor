import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeTypeScriptPattern} from "./pattern-highlighter.ts"

export function tokenizeTypeScript(lines: string[]): EditorTokens {
  return tokenizeTypeScriptPattern(lines)
}

export const typescriptHighlighter: LanguageHighlighter = {
  id: "typescript",
  name: "TypeScript / JavaScript",
  extensions: ["ts", "mts", "cts", "js", "mjs", "cjs"],
  aliases: ["ts", "js", "javascript"],
  tokenize: tokenizeTypeScript,
}
