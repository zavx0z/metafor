export type BreakpointSpecLike = {
  url?: string
  sourceUrl?: string
  urlRegex?: string
  line: number
}

export type BreakpointInstalledLike = {
  scriptId: string
  url: string
}

export type BreakpointRegistrationLike = {
  spec: BreakpointSpecLike
  installed: readonly BreakpointInstalledLike[]
}

export type BreakpointSourceIdentity = {
  scriptId: string
  scriptUrl: string
  sourceUrl: string
  key: string
}

export function breakpointSpecMatchesSource(spec: BreakpointSpecLike, source: BreakpointSourceIdentity): boolean {
  if (spec.sourceUrl !== undefined) {
    return sourceUrlsMatchAny(spec.sourceUrl, [source.sourceUrl, source.key, source.scriptUrl])
  }
  if (spec.url !== undefined) {
    return sourceUrlsMatchAny(spec.url, [source.scriptUrl, source.sourceUrl, source.key])
  }
  if (spec.urlRegex !== undefined) {
    return sourceRegexMatches(spec.urlRegex, [source.scriptUrl, source.sourceUrl, source.key])
  }
  return false
}

export function breakpointRegistrationMatchesSource(
  registration: BreakpointRegistrationLike,
  source: BreakpointSourceIdentity,
): boolean {
  if (breakpointSpecMatchesSource(registration.spec, source)) return true
  return registration.installed.some((installed) => (
    (source.scriptId.length > 0 && installed.scriptId === source.scriptId)
    || sourceUrlsMatchAny(installed.url, [source.scriptUrl, source.sourceUrl, source.key])
  ))
}

export function breakpointSpecMatchesModule(spec: BreakpointSpecLike, url: string, scriptUrl: string): boolean {
  if (spec.sourceUrl !== undefined) return sourceUrlsMatchAny(spec.sourceUrl, [url, scriptUrl])
  if (spec.url !== undefined) return sourceUrlsMatchAny(spec.url, [url, scriptUrl])
  if (spec.urlRegex !== undefined) return sourceRegexMatches(spec.urlRegex, [url, scriptUrl])
  return false
}

export function sameSourceUrl(a: string, b: string): boolean {
  const aVariants = sourceUrlVariants(a)
  const bVariants = sourceUrlVariants(b)
  const bVariantSet = new Set(bVariants)
  if (aVariants.some((value) => bVariantSet.has(value))) return true

  const aPaths = aVariants.map(sourcePathParts).filter((parts) => parts.length > 0)
  const bPaths = bVariants.map(sourcePathParts).filter((parts) => parts.length > 0)
  return aPaths.some((aPath) => bPaths.some((bPath) => samePathSuffix(aPath, bPath)))
}

function sourceUrlsMatchAny(expected: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => sameSourceUrl(expected, candidate))
}

function sourceRegexMatches(pattern: string, candidates: readonly string[]): boolean {
  try {
    const regex = new RegExp(pattern)
    return candidates.flatMap(sourceUrlVariants).some((variant) => regex.test(variant))
  } catch {
    return false
  }
}

function sourceUrlVariants(value: string): string[] {
  const variants = new Set<string>()
  const add = (next: string): void => {
    const clean = next.trim()
    if (clean.length === 0) return
    variants.add(clean)
    variants.add(clean.replaceAll("\\", "/"))
  }

  add(value)
  try {
    const url = new URL(value)
    if (url.protocol === "file:") add(decodeURIComponent(url.pathname))
  } catch {}
  return [...variants]
}

function sourcePathParts(value: string): string[] {
  let clean = value.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  try {
    const url = new URL(clean)
    if (url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:") {
      clean = decodeURIComponent(url.pathname)
    }
  } catch {}
  const parts = clean.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..")
  if (parts[0] === "r") parts.shift()
  return parts
}

function samePathSuffix(a: readonly string[], b: readonly string[]): boolean {
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length < 2 || shorter.length > longer.length) return false
  const offset = longer.length - shorter.length
  for (let idx = 0; idx < shorter.length; idx++) {
    if (shorter[idx] !== longer[offset + idx]) return false
  }
  return true
}
