import type {ReleasePackage} from "../state"

/** Release operations, которые запускаются по RPC-сообщению. */
export interface RpcBindings {
  updateModules(packages: ReleasePackage[]): Promise<string[]>
  restartBrowser(): Promise<void>
}

/** Запускает единственное RPC-подключение текущей Service Worker incarnation. */
export function startRpc(bindings: RpcBindings) {
  let socket: WebSocket | null = null
  let updates = Promise.resolve()
  const intentionalClosures = new WeakSet<WebSocket>()

  const applyRelease = async (connection: WebSocket, packages: ReleasePackage[]) => {
    try {
      console.debug("[@release/service:rpc:update]", "обновление пакетов началось", {packages})
      const updated = await bindings.updateModules(packages)
      if (updated.length === 0) {
        console.debug("[@release/service:rpc:update]", "кэш уже содержит доказанные версии", {
          packages: packages.map(({name, version}) => ({name, version})),
        })
        return
      }
      console.debug("[@release/service:rpc:update]", "кэш пакетов обновлён", {packages: updated})
      console.debug("[@release/service:rpc:update]", "закрываем прежнее подключение", {
        code: 1000,
        packages: updated,
      })
      intentionalClosures.add(connection)
      connection.close(1000, "release применён")
      console.debug("[@release/service:rpc:update]", "перезагрузка страниц началась", {
        packages: updated,
      })
      await bindings.restartBrowser()
      console.debug("[@release/service:rpc:update]", "перезагрузка страниц завершена", {
        packages: updated,
      })
    } catch (error) {
      console.debug("[@release/service:rpc:update]", "обновление пакетов завершилось с ошибкой", {
        packages,
      }, error)
      console.error(`Не удалось обновить пакеты ${packages.map(({name}) => name).join(", ")}`, error)
      throw error
    }
  }

  const synchronize = async (connection: WebSocket) => {
    const response = await fetch("/code", {cache: "no-store"})
    if (!response.ok) throw new Error(`Состояние пакетов недоступно: ${response.status}`)
    const state = await response.json() as {packages?: unknown}
    const message = releaseMessage({type: "release", packages: state.packages})
    if (message === null) throw new Error("Сервер вернул некорректное состояние пакетов")
    console.debug("[@release/service:rpc:update]", "получено текущее состояние пакетов", {
      packages: message.packages,
    })
    await applyRelease(connection, message.packages)
  }

  const enqueueUpdate = (connection: WebSocket, update: () => Promise<void>) => {
    updates = updates.then(update, update).catch((error) => {
      console.debug("[@release/service:rpc:update]", "не удалось синхронизировать пакеты", error)
      console.error("Не удалось синхронизировать браузерные пакеты", error)
      if (connection.readyState === WebSocket.OPEN)
        setTimeout(() => enqueueUpdate(connection, () => synchronize(connection)), 1_000)
    })
  }

  const connect = () => {
    if (socket && socket.readyState < WebSocket.CLOSING) return

    const url = new URL("/sw", location.origin)
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const connection = new WebSocket(url)
    socket = connection
    console.debug("[@release/service:rpc]", "подключаемся к серверу обновлений", {
      from: location.origin,
      to: url.href,
    })

    connection.addEventListener("open", () => {
      console.debug("[@release/service:rpc]", "подключились к серверу обновлений", {
        to: connection.url,
      })
      enqueueUpdate(connection, () => synchronize(connection))
    })

    connection.addEventListener("message", (event) => {
      const message = buildMessage(event.data)
      if (message === null) return
      console.debug("[@release/service:rpc:update]", "получено уведомление об обновлении", {
        from: connection.url,
        packages: message.packages,
      })
      enqueueUpdate(connection, () => applyRelease(connection, message.packages))
    })

    connection.addEventListener("close", (event) => {
      socket = null
      const intentional = intentionalClosures.delete(connection)
      console.debug("[@release/service:rpc]", "отключились от сервера обновлений", {
        code: event.code,
        intentional,
        reason: event.reason,
        wasClean: event.wasClean,
      })
      if (!intentional) setTimeout(connect, 1_000)
    })

    connection.addEventListener("error", (error) => {
      console.debug("[@release/service:rpc]", "ошибка подключения к серверу обновлений", error)
      console.error("Ошибка WebSocket сервиса обновлений", error)
    })
  }

  connect()
}

/** Принимает только одно host notification с точным package state. */
function buildMessage(data: unknown): {type: "release", packages: ReleasePackage[]} | null {
  if (typeof data !== "string") return null

  let message: unknown
  try {
    message = JSON.parse(data)
  } catch {
    return null
  }

  return releaseMessage(message)
}

function releaseMessage(
  message: unknown,
): {type: "release", packages: ReleasePackage[]} | null {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null
  const input = message as Record<string, unknown>
  if (input.type !== "release" || !Array.isArray(input.packages) || input.packages.length === 0)
    return null

  const packages: ReleasePackage[] = []
  for (const entry of input.packages) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null
    const item = entry as Record<string, unknown>
    if (
      Object.keys(item).length !== 4
      || typeof item.name !== "string"
      || typeof item.version !== "string"
      || typeof item.endpoint !== "string"
      || typeof item.cache !== "string"
    ) return null
    packages.push({
      name: item.name,
      version: item.version,
      endpoint: item.endpoint,
      cache: item.cache,
    })
  }

  return {type: "release", packages}
}
