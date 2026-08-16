import {buildablePackage} from "./build"
import type {ReleasedPackage} from "./contracts"
import {publishPackages} from "./publish"
import {packageChanges} from "./request"
import {releasedPackageResponse, releaseStateResponse} from "./state"

/** Transport, через который release server сообщает готовое состояние. */
export interface ReleaseTransport<SocketData> {
  topic: string
  subscriberCount(server: Bun.Server<SocketData>): number
  publish(server: Bun.Server<SocketData>, message: string): unknown
}

/** Создаёт полный GET/POST route `/code` без release policy в корневом server. */
export function releaseRoute<SocketData>(transport: ReleaseTransport<SocketData>) {
  return {
    GET: getRelease,
    POST: (request: Request, server: Bun.Server<SocketData>) =>
      publishRelease(request, server, transport),
  }
}

async function getRelease(request: Request) {
  const url = new URL(request.url)
  const requested = url.searchParams.get("module")
  if (requested === null) return await releaseStateResponse()

  debug("delivery", "получен запрос клиентского пакета", {package: requested})
  const name = await buildablePackage(requested)
  if (name === null) {
    debug("delivery", "клиентский пакет не найден", {package: requested, status: 404})
    return new Response(null, {status: 404})
  }

  const response = await releasedPackageResponse(name, url.searchParams.get("version"))
  debug("delivery", "клиентский пакет готов к отправке", {package: name, status: response.status})
  return response
}

async function publishRelease<SocketData>(
  request: Request,
  server: Bun.Server<SocketData>,
  transport: ReleaseTransport<SocketData>,
) {
  debug("update", "получен запрос на обновление", {
    contentType: request.headers.get("Content-Type"),
    endpoint: new URL(request.url).pathname,
  })

  const packages = await packageChanges(request)
  if (packages instanceof Response) {
    debug("update", "запрос на обновление отклонён", {status: packages.status})
    return packages
  }

  debug("update", "пакеты приняты для обновления", {packages})
  debug("update", "сборка пакетов началась", {packages})
  const response = await publishPackages(packages)
  if (!response.success) {
    debug("update", "сборка пакетов завершилась с ошибкой", {
      packages,
      results: releaseResults(response.results),
    })
    return Response.json(response, {status: 422})
  }

  debug("update", "сборка и публикация пакетов завершены", {
    packages: response.packages,
    results: releaseResults(response.results),
  })
  notifyRelease(server, transport, response.packages)
  return Response.json(response)
}

function notifyRelease<SocketData>(
  server: Bun.Server<SocketData>,
  transport: ReleaseTransport<SocketData>,
  packages: ReleasedPackage[],
) {
  const message = JSON.stringify({type: "release", packages})
  debug("update", "отправляем уведомление об обновлении", {
    packages,
    subscribers: transport.subscriberCount(server),
    topic: transport.topic,
  })
  const sendStatus = transport.publish(server, message)
  debug("update", "уведомление об обновлении отправлено", {
    packages,
    sendStatus,
    topic: transport.topic,
  })
}

function releaseResults(results: {module: string, success: boolean, exitCode: number | null, outputs: unknown[]}[]) {
  return results.map(({module, success, exitCode, outputs}) => ({
    module,
    success,
    exitCode,
    outputs,
  }))
}

function debug(scope: "delivery" | "update", event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug(`[@release/server:${scope}]`, event, details)
}
