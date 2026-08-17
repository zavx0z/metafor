import {artifactIntegrity, verifyPackageResponse} from "../../package-integrity"
import {
  browserPackageCache,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../../package-url"
import type {ReleasePackage} from "./state"

const codeCaches = ["release", "internal", "metafor"] as const

/** Собирает полный current state из фактических exact entries canonical code caches. */
export async function currentReleasePackages(): Promise<ReleasePackage[]> {
  const available = new Set(await caches.keys())
  const packages: ReleasePackage[] = []

  for (const storage of codeCaches) {
    if (!available.has(storage)) continue
    const cache = await caches.open(storage)
    for (const request of await cache.keys()) {
      const response = await cache.match(request)
      if (!response) continue
      const identity = await cachedPackageIdentity(storage, request, response)
      if (identity !== null) packages.push(identity)
    }
  }

  return packages.sort((left, right) =>
    browserPackageUrl(left.name, left.env, left.version)
      .localeCompare(browserPackageUrl(right.name, right.env, right.version)))
}

/** Проверяет одну фактическую cache entry и не принимает повреждённую metadata/body. */
export async function cachedPackageIdentity(
  storage: string,
  request: Request,
  response: Response,
): Promise<ReleasePackage | null> {
  const parsed = parseBrowserPackageUrl(new URL(request.url))
  if (
    parsed === null
    || parsed.version === null
    || browserPackageCache(parsed.name) !== storage
  ) return null
  const identity = {
    name: parsed.name,
    env: parsed.env,
    version: parsed.version,
    ...await artifactIntegrity(await response.clone().arrayBuffer()),
  }
  try {
    await verifyPackageResponse(response, identity)
    return identity
  } catch {
    return null
  }
}
