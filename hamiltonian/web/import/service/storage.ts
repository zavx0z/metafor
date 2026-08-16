import type {Module} from "./loader"
import type {UpdatePackage} from "../../startup/service/loader"

/** Сменяемые browser modules и принадлежащие им Cache Storage. */
export const modules = {
  "@import/main": {
    endpoint: "/code?module=@import/main",
    cache: "import",
  },
  "@import/service": {
    endpoint: "/code?module=@import/service",
    cache: "import",
  },
  "@internal/rpc": {
    endpoint: "/code?module=@internal/rpc",
    cache: "internal",
  },
} as const satisfies Record<string, Module>

/** Internal RPC module, из которого importer формирует Service Worker-контур. */
export const rpc = modules["@internal/rpc"]

/** Проверяет package state, полученный от того же Hamiltonian origin. */
export function updatePackages(value: unknown): UpdatePackage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const packages: UpdatePackage[] = []
  const names = new Set<string>()

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null
    const item = entry as Record<string, unknown>
    if (
      Object.keys(item).length !== 4
      || typeof item.name !== "string"
      || typeof item.version !== "string"
      || typeof item.endpoint !== "string"
      || typeof item.cache !== "string"
      || !/^\d+\.\d+\.\d+$/.test(item.version)
      || cacheOwner(item.name) !== item.cache
    ) return null

    const endpoint = new URL(item.endpoint, location.origin)
    if (
      endpoint.origin !== location.origin
      || endpoint.pathname !== "/code"
      || endpoint.searchParams.get("module") !== item.name
      || endpoint.searchParams.get("version") !== item.version
      || [...endpoint.searchParams].length !== 2
      || names.has(item.name)
    ) return null

    names.add(item.name)
    packages.push({
      name: item.name,
      version: item.version,
      endpoint: `${endpoint.pathname}${endpoint.search}`,
      cache: item.cache,
    })
  }

  return packages
}

function cacheOwner(name: string) {
  if (name.startsWith("@import/")) return "import"
  if (name.startsWith("@internal/")) return "internal"
  if (name.startsWith("@metafor/")) return "metafor"
  return null
}
