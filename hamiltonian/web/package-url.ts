/** Browser package namespaces, доступные через одноимённые origin paths. */
export type BrowserPackageNamespace = "startup" | "release" | "internal" | "metafor"

const packageNamePattern = /^@(startup|release|internal|metafor)\/[^/]+$/

/** Возвращает package name из его канонического origin pathname. */
export function browserPackageName(pathname: string) {
  if (!pathname.startsWith("/")) return null
  const name = pathname.slice(1)
  return packageNamePattern.test(name) ? name : null
}

/** Формирует стабильный либо exact versioned URL browser package. */
export function browserPackageUrl(name: string, version?: string) {
  if (!packageNamePattern.test(name)) throw new Error(`Некорректное имя browser package: ${name}`)
  return version === undefined ? `/${name}` : `/${name}?version=${encodeURIComponent(version)}`
}

/** Возвращает постоянный Cache Storage владельца package namespace. */
export function browserPackageCache(name: string | null) {
  if (name?.startsWith("@startup/")) return "startup"
  if (name?.startsWith("@release/")) return "release"
  if (name?.startsWith("@internal/")) return "internal"
  if (name?.startsWith("@metafor/")) return "metafor"
  return null
}
