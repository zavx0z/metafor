import {buildablePackage} from "./build"
import {releasedPackageResponse, releaseStateResponse} from "./state"

/** Возвращает состояние release либо один готовый browser artifact. */
export async function getRelease(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get("module")
  if (requested === null) return await releaseStateResponse()

  debug("получен запрос клиентского пакета", {package: requested})
  const name = await buildablePackage(requested)
  if (name === null) {
    debug("клиентский пакет не найден", {package: requested, status: 404})
    return new Response(null, {status: 404})
  }

  const response = await releasedPackageResponse(name, url.searchParams.get("version"))
  debug("клиентский пакет готов к отправке", {package: name, status: response.status})
  return response
}

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@release/server:delivery]", event, details)
}
