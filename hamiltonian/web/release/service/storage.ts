import type {ReleasePackage} from "./state"
import {browserPackageCache, browserPackageName} from "../../package-url"

/** Проверяет package state, полученный от того же Hamiltonian origin. */
export function updatePackages(value: unknown): ReleasePackage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const packages: ReleasePackage[] = []
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
      || browserPackageCache(item.name) !== item.cache
    ) return null

    const endpoint = new URL(item.endpoint, location.origin)
    if (
      endpoint.origin !== location.origin
      || browserPackageName(endpoint.pathname) !== item.name
      || endpoint.searchParams.get("version") !== item.version
      || [...endpoint.searchParams].length !== 1
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
