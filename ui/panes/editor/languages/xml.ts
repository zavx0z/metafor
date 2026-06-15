import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeXmlPattern} from "./pattern-highlighter.ts"

export function tokenizeXml(lines: string[]): EditorTokens {
  return tokenizeXmlPattern(lines)
}

export const xmlHighlighter: LanguageHighlighter = {
  id: "xml",
  name: "XML / SVG",
  extensions: ["xml", "svg"],
  aliases: ["svg"],
  tokenize: tokenizeXml,
}
