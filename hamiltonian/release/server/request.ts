import type {PackageChange, ReleasablePackage, VersionChange} from "./contracts"
import {releasedPackages} from "./state"
import {isVersionChange} from "./version"

/** Разбирает JSON-контракт package version change группы. */
export async function packageChanges(request: Request): Promise<PackageChange[] | Response> {
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType !== "application/json") return new Response(null, {status: 415})
  if (new URL(request.url).search !== "") return new Response(null, {status: 400})

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return new Response(null, {status: 400})
  }

  if (!isPackageChangeInput(input)) return new Response(null, {status: 400})

  const released = new Set((await releasedPackages()).map(({name}) => name))
  const changes = new Map<ReleasablePackage, VersionChange>()
  for (const entry of input.packages) {
    if (!released.has(entry.name as ReleasablePackage)) return new Response(null, {status: 404})
    const name = entry.name as ReleasablePackage
    const previous = changes.get(name)
    if (previous !== undefined && previous !== entry.change)
      return new Response(null, {status: 400})
    changes.set(name, entry.change)
  }

  return [...changes].map(([name, change]) => ({name, change}))
}

function isPackageChangeInput(
  value: unknown,
): value is {packages: {name: string, change: VersionChange}[]} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (Object.keys(input).length !== 1 || !Array.isArray(input.packages)) return false
  if (input.packages.length === 0) return false

  return input.packages.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false
    const change = entry as Record<string, unknown>
    return Object.keys(change).length === 2
      && typeof change.name === "string"
      && isVersionChange(change.change)
  })
}
