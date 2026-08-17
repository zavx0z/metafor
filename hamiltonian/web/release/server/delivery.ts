import {buildablePackage} from "./build"
import {releasedPackageResponse, releaseStateResponse} from "./state"
import {parseBrowserPackageUrl} from "../../package-url"

/** Возвращает текущее доказанное release state только без query parameters. */
export async function getRelease(request: Request) {
  const url = new URL(request.url)
  if (url.search !== "") return new Response(null, {status: 404})
  return await releaseStateResponse()
}

/** Возвращает browser artifact, чьё package name совпадает с pathname. */
export async function getPackage(request: Request) {
  const url = new URL(request.url)
  const requested = parseBrowserPackageUrl(url)
  if (requested === null) return new Response(null, {status: 404})

  debug("получен запрос клиентского пакета", {package: requested.name, env: requested.env})
  const name = await buildablePackage(requested.name, requested.env)
  if (name === null) {
    debug("клиентский пакет не найден", {package: requested, status: 404})
    return new Response(null, {status: 404})
  }

  const response = await releasedPackageResponse(name, requested.env, requested.version)
  debug("клиентский пакет готов к отправке", {
    package: name,
    env: requested.env,
    status: response.status,
  })
  return response
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@release/server:delivery]", event, details)
}
