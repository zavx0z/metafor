import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"

export function tokenizePlaintext(lines: string[]): EditorTokens {
  return lines.map(() => [])
}

export const plaintextHighlighter: LanguageHighlighter = {
  id: "plaintext",
  name: "Plain text",
  extensions: ["txt", "text", "md", "markdown"],
  aliases: ["plain", "text"],
  tokenize: tokenizePlaintext,
}
