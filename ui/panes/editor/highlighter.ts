import {cssHighlighter} from "./languages/css.ts"
import {htmlHighlighter} from "./languages/html.ts"
import {jsonHighlighter} from "./languages/json.ts"
import {plaintextHighlighter} from "./languages/plaintext.ts"
import {sqliteHighlighter} from "./languages/sqlite.ts"
import {typescriptHighlighter} from "./languages/typescript.ts"
import type {LanguageHighlighter} from "./tokens.ts"

export type ResolveHighlighterOpts = {
  languageId?: string
  path?: string
  filename?: string
}

const registry: LanguageHighlighter[] = [
  plaintextHighlighter,
  typescriptHighlighter,
  sqliteHighlighter,
  cssHighlighter,
  htmlHighlighter,
  jsonHighlighter,
]

export function registerLanguageHighlighter(highlighter: LanguageHighlighter): void {
  const idx = registry.findIndex((item) => item.id === highlighter.id)
  if (idx >= 0) registry[idx] = highlighter
  else registry.push(highlighter)
}

export function listLanguageHighlighters(): readonly LanguageHighlighter[] {
  return registry
}

export function resolveLanguageHighlighter(opts: ResolveHighlighterOpts = {}): LanguageHighlighter {
  const languageId = opts.languageId?.toLowerCase()
  if (languageId !== undefined && languageId.length > 0) {
    const exact = registry.find((item) =>
      item.id.toLowerCase() === languageId ||
      (item.aliases ?? []).some((alias) => alias.toLowerCase() === languageId)
    )
    if (exact !== undefined) return exact
  }

  const ext = extensionOf(opts.filename ?? opts.path ?? "")
  if (ext.length > 0) {
    const byExt = registry.find((item) =>
      (item.extensions ?? []).some((candidate) => candidate.toLowerCase() === ext)
    )
    if (byExt !== undefined) return byExt
  }

  return plaintextHighlighter
}

function extensionOf(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path
  const slash = Math.max(withoutQuery.lastIndexOf("/"), withoutQuery.lastIndexOf("\\"))
  const file = withoutQuery.slice(slash + 1)
  const dot = file.lastIndexOf(".")
  if (dot < 0 || dot === file.length - 1) return ""
  return file.slice(dot + 1).toLowerCase()
}
