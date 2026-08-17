import {
  isBrowserPackageEnvironment,
  type BrowserPackageEnvironment,
} from "./package-environment"

/** Browser package namespaces, доступные через одноимённые origin paths. */
export type BrowserPackageNamespace = "startup" | "release" | "internal" | "metafor"

const packageNamePattern = /^@(hamiltonian|internal|metafor)\/[^/]+$/
const versionPattern = /^\d+\.\d+\.\d+$/

export interface BrowserPackageUrl {
  name: string
  env: BrowserPackageEnvironment
  version: string | null
}

/** Возвращает package name из его канонического origin pathname. */
export function browserPackageName(pathname: string) {
  if (!pathname.startsWith("/")) return null
  const name = pathname.slice(1)
  return packageNamePattern.test(name) ? name : null
}

/** Формирует единственный canonical stable либо exact URL browser artifact. */
export function browserPackageUrl(
  name: string,
  env: BrowserPackageEnvironment,
  version?: string,
) {
  if (!packageNamePattern.test(name)) throw new Error(`Некорректное имя browser package: ${name}`)
  if (!isBrowserPackageEnvironment(env))
    throw new Error(`Некорректная среда browser package: ${env}`)
  if (version !== undefined && !versionPattern.test(version))
    throw new Error(`Некорректная версия browser package: ${version}`)
  const stable = `/${name}?env=${encodeURIComponent(env)}`
  return version === undefined ? stable : `${stable}&version=${encodeURIComponent(version)}`
}

/** Строго разбирает только canonical package URL с env перед version. */
export function parseBrowserPackageUrl(url: URL): BrowserPackageUrl | null {
  const name = browserPackageName(url.pathname)
  if (name === null) return null
  const entries = [...url.searchParams]
  if (entries.length < 1 || entries.length > 2 || entries[0]?.[0] !== "env") return null
  const env = entries[0][1]
  if (!isBrowserPackageEnvironment(env)) return null

  let version: string | null = null
  if (entries.length === 2) {
    if (entries[1]?.[0] !== "version" || !versionPattern.test(entries[1][1])) return null
    version = entries[1][1]
  }

  const canonical = browserPackageUrl(name, env, version ?? undefined)
  return `${url.pathname}${url.search}` === canonical ? {name, env, version} : null
}

/** Возвращает ключ одного `(package, env)` slot без version. */
export function browserPackageSlot(name: string, env: BrowserPackageEnvironment) {
  return browserPackageUrl(name, env)
}

/** Возвращает постоянный Cache Storage владельца package namespace. */
export function browserPackageCache(name: string | null) {
  if (name === "@hamiltonian/startup") return "startup"
  if (name === "@hamiltonian/release") return "release"
  if (name?.startsWith("@internal/")) return "internal"
  if (name?.startsWith("@metafor/")) return "metafor"
  return null
}
