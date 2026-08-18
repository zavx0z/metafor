import {releaseChangedMessage} from "../../shared/protocol"
import {publishPackages} from "./publication"
import {packageChanges} from "./request"

/** Доставка package signal через transport корневого server. */
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
  const packages = await packageChanges(request)
  if (packages instanceof Response) {
    debug("запрос публикации отклонён", {
      endpoint: new URL(request.url).pathname,
      status: packages.status,
    })
    return packages
  }

  debug("публикация release запрошена", {packages})
  const response = await publishPackages(packages)
  if (!response.success) {
    console.error("[@hamiltonian/release:server:update]", "публикация release завершилась с ошибкой", {
      packages,
      results: releaseResults(response.results),
    })
    return Response.json(response, {status: 422})
  }

  debug("публикация release завершена", {
    packages: response.packages,
    results: releaseResults(response.results),
  })
  notifyRelease(notification)
  return Response.json(response)
}

export function notifyRelease(notification: ReleaseNotification) {
  const message = JSON.stringify(releaseChangedMessage())
  const subscribers = notification.subscriberCount()
  const sendStatus = notification.publish(message)
  debug("сигнал об обновлении отправлен", {
    sendStatus,
    subscribers,
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
    console.debug("[@hamiltonian/release:server:update]", event, details)
}
