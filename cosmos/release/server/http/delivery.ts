import {buildablePackage} from "../package/build"
import {
  releasedPackageResponse,
  releasedPackageSourceMapResponse,
  releaseStateResponse,
} from "../release/state"
import {parseBrowserPackageUrl} from "../../../shared/package/url"
import {parseBrowserPackageSourceMapUrl} from "../package/source-map"

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
  const requested = sourceMap ?? parseBrowserPackageUrl(url)
  if (requested === null) return new Response(null, {status: 404})

  const name = await buildablePackage(requested.name, requested.env)
  if (name === null) {
    debug("browser artifact не найден", {
      env: requested.env,
      package: requested.name,
      status: 404,
      version: requested.version,
    })
    return new Response(null, {status: 404})
  }

  const response = sourceMap
    ? await releasedPackageSourceMapResponse(name, requested.env, requested.version, request)
    : await releasedPackageResponse(name, requested.env, requested.version, request)
  if (response.ok) {
    debug("browser artifact доставлен", {
      env: requested.env,
      package: name,
      status: response.status,
      version: requested.version ?? response.headers.get("X-Package-Version"),
    })
  } else {
    debug("browser artifact не найден", {
      env: requested.env,
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
