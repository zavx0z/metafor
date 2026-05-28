const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs", ".json", ".yml", ".yaml"] as const

export type ModuleImport = {
  specifier: string
  candidates: string[]
}

export function localImportsForSource(sourceUrl: string, source: string): ModuleImport[] {
  const out: ModuleImport[] = []
  const seen = new Set<string>()

  for (const specifier of importSpecifiers(source)) {
    const candidates = resolveLocalImportCandidates(sourceUrl, specifier)
    if (candidates.length === 0) continue
    const key = candidates[0]
    if (key === undefined || seen.has(key)) continue
    seen.add(key)
    out.push({specifier, candidates})
  }

  return out
}

export function resolveLocalImportCandidates(importerUrl: string, specifier: string): string[] {
  const spec = specifier.trim()
  if (!spec.startsWith("./") && !spec.startsWith("../")) return []

  const importerPath = modulePath(importerUrl)
  const slash = importerPath.lastIndexOf("/")
  const importerDir = slash < 0 ? "" : importerPath.slice(0, slash)
  const joined = normalizePath(importerDir.length === 0 ? spec : `${importerDir}/${spec}`)
  if (hasKnownExtension(joined)) return [joined]

  const candidates: string[] = []
  candidates.push(joined)
  for (const ext of MODULE_EXTENSIONS) candidates.push(`${joined}${ext}`)
  for (const ext of MODULE_EXTENSIONS) candidates.push(`${joined}/index${ext}`)
  return dedupe(candidates)
}

export function canonicalModulePath(url: string): string {
  const parts = modulePath(url)
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
  if (parts[0] === "r") parts.shift()
  return parts.join("/")
}

function importSpecifiers(source: string): string[] {
  const matches: Array<{index: number; specifier: string}> = []
  const stripped = stripComments(source)
  collectImportSpecifiers(stripped, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, matches)
  collectImportSpecifiers(stripped, /\bimport\s+(?!type\b)(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g, matches)
  collectImportSpecifiers(stripped, /\bexport\s+(?!type\b)[^"'()]*?\s+from\s*["']([^"']+)["']/g, matches)
  return dedupe(matches.sort((a, b) => a.index - b.index).map((match) => match.specifier))
}

function collectImportSpecifiers(source: string, regex: RegExp, out: Array<{index: number; specifier: string}>): void {
  for (;;) {
    const match = regex.exec(source)
    if (match === null) return
    const specifier = match[1]
    if (specifier !== undefined) out.push({index: match.index, specifier})
  }
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

function hasKnownExtension(path: string): boolean {
  return MODULE_EXTENSIONS.some((ext) => path.endsWith(ext))
}

function modulePath(url: string): string {
  let clean = url.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  try {
    const parsed = new URL(clean)
    if (parsed.protocol === "file:" || parsed.protocol === "http:" || parsed.protocol === "https:") {
      clean = decodeURIComponent(parsed.pathname)
    }
  } catch {}
  return clean
}

function normalizePath(path: string): string {
  const absolute = path.startsWith("/")
  const parts: string[] = []
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part.length === 0 || part === ".") continue
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop()
      else if (!absolute) parts.push(part)
      continue
    }
    parts.push(part)
  }
  return `${absolute ? "/" : ""}${parts.join("/")}`
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}
