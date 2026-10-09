import {builder} from "../services"
const {knownPackage} = builder

import {
  releasedPackageArtifactResponse,
  releasedPackageSourceMapResponse,
  releaseStateResponse,
} from "./state"
import {rootPackageArtifact} from "@metafor/tech-build/identity"
import {parseBrowserPackageArtifactUrl} from "@metafor/tech-build/identity"
import {parseBrowserPackageSourceMapUrl} from "./source-map"

/** Возвращает текущее доказанное release state только без query parameters. */
export async function getRelease(request: Request) {
  const url = new URL(request.url)
  if (url.search !== "") return new Response(null, {status: 404})
  return await releaseStateResponse()
}

/** Возвращает browser artifact, чьё package name совпадает с pathname. */
export async function getPackage(request: Request) {
  const url = new URL(request.url)
  const sourceMap = parseBrowserPackageSourceMapUrl(url)
  const artifactRequest = sourceMap === null ? parseBrowserPackageArtifactUrl(url) : null
  const requested = sourceMap ?? artifactRequest
  if (requested === null) return new Response(null, {status: 404})

  const name = await knownPackage(requested.name)
  if (name === null) {
    debug("browser artifact не найден", {
      artifact: artifactRequest?.artifact ?? null,
      env: requested.env,
      package: requested.name,
      status: 404,
      version: requested.version,
    })
    return new Response(null, {status: 404})
  }

  const response = sourceMap
    ? await releasedPackageSourceMapResponse(name, requested.env, requested.version, request, sourceMap.artifact)
    : await releasedPackageArtifactResponse(
        name,
        requested.env,
        artifactRequest?.artifact ?? rootPackageArtifact,
        requested.version,
        request,
      )
  if (response.ok) {
    debug("browser artifact доставлен", {
      env: requested.env,
      artifact: artifactRequest?.artifact ?? null,
      package: name,
      status: response.status,
      version: requested.version ?? response.headers.get("X-Package-Version"),
    })
  } else {
    debug("browser artifact не найден", {
      env: requested.env,
      artifact: artifactRequest?.artifact ?? null,
      package: name,
      status: response.status,
      version: requested.version,
    })
  }
  return response
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@cosmos/release:server:delivery]", event, details)
}
