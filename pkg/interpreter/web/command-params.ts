import {stripSourceLine} from "./workspace-files.ts"

export type DisplaySelectorSide = "left" | "right" | "top" | "bottom" | "center"

export function objectParam(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function objectParamMaybe(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function importSpecifierFromText(text: string): string | undefined {
  const clean = text.trim().replace(/;$/, "").trim()
  const direct = /^["'`]([^"'`]+)["'`]$/.exec(clean)
  if (direct?.[1] !== undefined) return direct[1]
  const dynamicImport = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(clean)
  if (dynamicImport?.[1] !== undefined) return dynamicImport[1]
  const staticImport = /\bfrom\s*["'`]([^"'`]+)["'`]/.exec(clean)
  if (staticImport?.[1] !== undefined) return staticImport[1]
  const sideEffectImport = /^import\s+["'`]([^"'`]+)["'`]/.exec(clean)
  if (sideEffectImport?.[1] !== undefined) return sideEffectImport[1]
  return clean.includes("/") || /\.(?:c|m)?(?:t|j)sx?$/.test(clean) ? clean : undefined
}

export function sourceDirname(sourceUrl: string): string {
  const clean = stripSourceLine(sourceUrl).replaceAll("\\", "/").replace(/[?#].*$/, "")
  const idx = clean.lastIndexOf("/")
  if (idx < 0) return ""
  if (idx === 0) return "/"
  return clean.slice(0, idx)
}

export function joinSourcePath(baseDir: string, path: string): string {
  const joined = baseDir.length === 0 ? path : `${baseDir.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  const absolute = joined.startsWith("/")
  const parts: string[] = []
  for (const part of joined.replaceAll("\\", "/").split("/")) {
    if (part.length === 0 || part === ".") continue
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop()
      else if (!absolute) parts.push(part)
      continue
    }
    parts.push(part)
  }
  return absolute ? `/${parts.join("/")}` : parts.join("/")
}

export function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

export function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function booleanParam(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

export function firstNumberParam(params: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = numberParam(params[key])
    if (value !== undefined) return value
  }
  return undefined
}

export function sideParam(value: unknown): DisplaySelectorSide | undefined {
  if (value !== "left" && value !== "right" && value !== "top" && value !== "bottom" && value !== "center") return undefined
  return value
}
