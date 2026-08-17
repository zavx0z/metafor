import type {ReleasedPackage} from "./contracts"
import {publishPackages} from "./publish"
import {packageChanges} from "./request"

/** Доставка уведомления о доказанном release через transport корневого server. */
export interface ReleaseNotification {
  topic: string
  subscriberCount(): number
  publish(message: string): unknown
}

/** Собирает и атомарно публикует запрошенную группу packages. */
export async function publishRelease(
  request: Request,
  notification: ReleaseNotification,
) {
  debug("получен запрос на обновление", {
    contentType: request.headers.get("Content-Type"),
    endpoint: new URL(request.url).pathname,
  })

  const packages = await packageChanges(request)
  if (packages instanceof Response) {
    debug("запрос на обновление отклонён", {status: packages.status})
    return packages
  }

  debug("пакеты приняты для обновления", {packages})
  debug("сборка пакетов началась", {packages})
  const response = await publishPackages(packages)
  if (!response.success) {
    debug("сборка пакетов завершилась с ошибкой", {
      packages,
      results: releaseResults(response.results),
    })
    return Response.json(response, {status: 422})
  }

  debug("сборка и публикация пакетов завершены", {
    packages: response.packages,
    results: releaseResults(response.results),
  })
  notifyRelease(notification, response.packages)
  return Response.json(response)
}

function notifyRelease(notification: ReleaseNotification, packages: ReleasedPackage[]) {
  const message = JSON.stringify({type: "release", packages})
  debug("отправляем уведомление об обновлении", {
    packages,
    subscribers: notification.subscriberCount(),
    topic: notification.topic,
  })
  const sendStatus = notification.publish(message)
  debug("уведомление об обновлении отправлено", {
    packages,
    sendStatus,
    topic: notification.topic,
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

function debug(event: string, details: unknown) {
  if (Bun.env.NODE_ENV === "development")
    console.debug("[@release/server:update]", event, details)
}
