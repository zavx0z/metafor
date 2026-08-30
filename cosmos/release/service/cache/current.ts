import {
  artifactIntegrity,
} from "../../../shared/package/integrity"
import {
  verifyPackageArtifactResponse,
  type BrowserPackageArtifactIdentity,
} from "../../shared/artifact-integrity"
import {
  browserPackageIdentityUrl,
  parseBrowserPackageArtifactUrl,
} from "../../shared/artifact-url"
import {
  browserPackageCache,
} from "../../../shared/package/url"

/** Точная версия package в browser release. */
export interface ReleasePackage extends BrowserPackageArtifactIdentity {}

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
    browserPackageIdentityUrl(left).localeCompare(browserPackageIdentityUrl(right)))
}

/** Проверяет одну фактическую cache entry и не принимает повреждённую metadata/body. */
export async function cachedPackageIdentity(
  storage: string,
  request: Request,
  response: Response,
): Promise<ReleasePackage | null> {
  const parsed = parseBrowserPackageArtifactUrl(new URL(request.url))
  if (
    parsed === null
    || parsed.version === null
    || browserPackageCache(parsed.name) !== storage
  ) return null
  const identity = {
    name: parsed.name,
    env: parsed.env,
    ...(parsed.artifact === undefined ? {} : {artifact: parsed.artifact}),
    version: parsed.version,
    ...await artifactIntegrity(await response.clone().arrayBuffer()),
  }
  try {
    await verifyPackageArtifactResponse(response, identity)
    return identity
  } catch {
    return null
  }
}
