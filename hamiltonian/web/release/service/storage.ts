import type {ReleasePackage} from "./state"
import {isBrowserPackageEnvironment} from "../../package-environment"
import {isSha256} from "../../package-integrity"
import {browserPackageCache, browserPackageName, browserPackageSlot} from "../../package-url"

/** Проверяет package state, полученный от того же Hamiltonian origin. */
export function updatePackages(value: unknown): ReleasePackage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const packages: ReleasePackage[] = []
  const slots = new Set<string>()

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null
    const item = entry as Record<string, unknown>
    if (
      Object.keys(item).length !== 5
      || typeof item.name !== "string"
      || typeof item.env !== "string"
      || typeof item.version !== "string"
      || !isSha256(item.sha256)
      || typeof item.size !== "number"
      || !Number.isSafeInteger(item.size)
      || item.size <= 0
      || !/^\d+\.\d+\.\d+$/.test(item.version)
      || !isBrowserPackageEnvironment(item.env)
      || browserPackageName(`/${item.name}`) !== item.name
      || browserPackageCache(item.name) === null
    ) return null

    const slot = browserPackageSlot(item.name, item.env)
    if (slots.has(slot)) return null

    slots.add(slot)
    packages.push({
      name: item.name,
      env: item.env,
      version: item.version,
      sha256: item.sha256,
      size: item.size,
    })
  }

  return packages
}
