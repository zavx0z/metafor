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

export function sourceDisplayLocation(location: string | undefined, segments = 2): string {
  if (location === undefined || location.length === 0) return ""
  const path = sourceDisplayPath(sourcePathFromLocation(location), segments)
  if (path.length === 0) return ""
  const line = sourceLineFromLocation(location)
  return line.length === 0 ? path : `${path}:${line}`
}

export function tokensForSourceView(source: SourceViewSource): EditorTokens | undefined {
  if (source.tokens !== undefined) return source.tokens
  if (source.lines.length === 0) return undefined
  return resolveLanguageHighlighter({path: sourcePathFromLocation(source.location)}).tokenize(source.lines)
}

function sourceLineFromLocation(location: string): string {
  const idx = location.lastIndexOf(":")
  if (idx < 0) return ""
  const line = location.slice(idx + 1)
  return /^\d+$/.test(line) ? line : ""
}

function sourceDisplayPath(path: string, segments: number): string {
  const clean = sourceUrlPath(path)
    .replaceAll("\\", "/")
    .replace(/[?#].*$/, "")
  const parts = clean.split("/").filter((part) => part.length > 0 && part !== ".")
  if (parts.length === 0) return clean
  const count = Math.max(1, Math.min(parts.length, Math.floor(segments)))
  return parts.slice(-count).join("/")
}

function sourceUrlPath(path: string): string {
  try {
    const url = new URL(path)
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") return decodeURIComponent(url.pathname)
  } catch {
    return path
  }
  return path
}
