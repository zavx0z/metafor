export type EditorToken = {
  /** Start column, 0-based, inclusive. */
  s: number
  /** End column, 0-based, exclusive. */
  e: number
  /** Syntax category, matched against `syntaxTokens` from theme. */
  c: string
  /** Optional resolved foreground color from the active syntax theme. */
  fg?: string
  /** Optional color swatch/background hint for token-aware editors. */
  bg?: string
}

export type EditorTokens = EditorToken[][]
export type EditorTokenize = (lines: string[]) => EditorTokens

export type LanguageHighlighter = {
  id: string
  name: string
  extensions?: string[]
  aliases?: string[]
  tokenize(lines: string[]): EditorTokens
}
