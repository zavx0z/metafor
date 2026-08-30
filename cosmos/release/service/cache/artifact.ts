import {
  verifyPackageArtifactResponse,
  type BrowserPackageArtifactIdentity,
} from "../../shared/artifact-integrity"
import {
  browserPackageArtifactUrl,
  browserPackageIdentitySlot,
  browserPackageIdentityUrl,
  parseBrowserPackageArtifactUrl,
  type BrowserPackageArtifactUrl,
} from "../../shared/artifact-url"

/** Pins one stable non-root network miss to the first active root version. */
export async function releaseArtifactNetworkRequest(
  owner: string,
  requested: BrowserPackageArtifactUrl,
  request: Request,
) {
  if (requested.artifact === undefined)
    throw new Error("Release artifact network pin requires a non-root request")
  if (requested.version !== null) return request
  const version = await activeRootVersion(await caches.open(owner), requested)
  if (version === null) return request
  return new Request(new URL(browserPackageArtifactUrl(
    requested.name,
    requested.env,
    requested.artifact,
    version,
  ), request.url), request)
}

/** Stores one non-root response only under its exact reader-first identity. */
export async function cacheReleaseArtifact(
  owner: string,
  requested: BrowserPackageArtifactUrl,
  response: Response,
) {
  const identity = await responseIdentity(requested, response)
  const cache = await caches.open(owner)
  if (await activeRootVersion(cache, requested) !== identity.version) return
  const exact = exactRequest(identity)
  await cache.put(exact, response)
  if (await activeRootVersion(cache, requested) !== identity.version) {
    await cache.delete(exact, {ignoreVary: true})
  }
}

/** Reads an exact non-root entry or the entry owned by the active root version. */
export async function readReleaseArtifact(
  owner: string,
  requested: BrowserPackageArtifactUrl,
) {
  const cache = await caches.open(owner)
  if (requested.version !== null) {
    const exact = exactRequest(requested as ExactArtifact)
    const response = await cache.match(exact, {
      ignoreVary: true,
    })
    if (response) {
      try {
        await responseIdentity(requested, response)
      } catch {
        await cache.delete(exact, {ignoreVary: true})
        return undefined
      }
    }
    return response
  }

  const version = await activeRootVersion(cache, requested)
  if (version === null) return undefined
  const exact = {...requested, version} satisfies ExactArtifact
  const key = exactRequest(exact)
  const response = await cache.match(key, {ignoreVary: true})
  if (response) {
    try {
      await responseIdentity(exact, response)
    } catch {
      await cache.delete(key, {ignoreVary: true})
      return undefined
    }
  }
  return response
}

type ExactArtifact = BrowserPackageArtifactUrl & {version: string}

async function activeRootVersion(cache: Cache, requested: BrowserPackageArtifactUrl) {
  for (const request of await cache.keys()) {
    const parsed = parseBrowserPackageArtifactUrl(new URL(request.url))
    if (
      parsed === null
      || parsed.artifact !== undefined
      || parsed.version === null
      || parsed.name !== requested.name
      || parsed.env !== requested.env
    ) continue
    return parsed.version
  }
  return null
}

async function responseIdentity(
  requested: BrowserPackageArtifactUrl,
  response: Response,
): Promise<BrowserPackageArtifactIdentity> {
  const artifact = response.headers.get("X-Package-Artifact") ?? undefined
  const identity = {
    name: response.headers.get("X-Package-Name"),
    env: response.headers.get("X-Package-Env"),
    artifact,
    version: response.headers.get("X-Package-Version"),
    sha256: response.headers.get("X-Package-SHA256"),
    size: Number(response.headers.get("X-Package-Size")),
  }
  if (
    identity.name !== requested.name
    || identity.env !== requested.env
    || identity.artifact !== requested.artifact
    || typeof identity.version !== "string"
    || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(identity.version)
    || typeof identity.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(identity.sha256)
    || !Number.isSafeInteger(identity.size)
    || identity.size <= 0
  ) throw new Error(`Package response ${requested.name}:${requested.env} has invalid artifact identity`)

  const verified = identity as BrowserPackageArtifactIdentity
  if (requested.version !== null && requested.version !== verified.version)
    throw new Error(`Package response ${requested.name}:${requested.env} has another version`)
  await verifyPackageArtifactResponse(response, verified)
  return verified
}

function exactRequest(identity: ExactArtifact | BrowserPackageArtifactIdentity) {
  return new Request(new URL(browserPackageIdentityUrl(identity), location.origin), {
    cache: "no-store",
  })
}

/** Same logical slot helper kept local to make accidental root fallback impossible. */
export function sameReleaseArtifactSlot(
  left: Pick<BrowserPackageArtifactIdentity, "name" | "env" | "artifact">,
  right: Pick<BrowserPackageArtifactIdentity, "name" | "env" | "artifact">,
) {
  return browserPackageIdentitySlot(left) === browserPackageIdentitySlot(right)
}
