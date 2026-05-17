import {resolveLanguageHighlighter} from "./highlighter.ts"
import type {EditorTokens} from "./tokens.ts"

export type SourceViewSource = {
  lines: string[]
  location: string
  tokens?: EditorTokens
}

export function sourcePathFromLocation(location: string | undefined): string {
  if (location === undefined) return ""
  const idx = location.lastIndexOf(":")
  if (idx < 0) return location
  return location.slice(0, idx)
}

export function tokensForSourceView(source: SourceViewSource): EditorTokens | undefined {
  if (source.tokens !== undefined) return source.tokens
  if (source.lines.length === 0) return undefined
  return resolveLanguageHighlighter({path: sourcePathFromLocation(source.location)}).tokenize(source.lines)
}
