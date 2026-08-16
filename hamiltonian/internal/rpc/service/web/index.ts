/**
 * Web-реализация RPC service для Service Worker.
 *
 * Загруженный release запускает artifact один раз за текущую инкарнацию
 * Worker. Service открывает WebSocket исходного origin; transport protocol
 * повторяет security context страницы.
 *
 * @packageDocumentation
 */

interface ReleasedPackage {
  name: string
  version: string
  endpoint: string
  cache: string
}

declare const updateModules: (packages: ReleasedPackage[]) => Promise<string[]>
declare const restartBrowser: () => Promise<void>

let socket: WebSocket | null = null
let updates = Promise.resolve()
const intentionalClosures = new WeakSet<WebSocket>()

connect()

/** Открывает единственный RPC WebSocket текущей Service Worker инкарнации. */
function connect() {
  if (socket && socket.readyState < WebSocket.CLOSING) return

  const url = new URL("/sw", location.origin)
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const connection = new WebSocket(url)
  socket = connection
  console.debug("[@internal/rpc/service]", "подключаемся к серверу обновлений", {
    from: location.origin,
    to: url.href,
  })

  connection.addEventListener("open", () => {
    console.debug("[@internal/rpc/service]", "подключились к серверу обновлений", {
      to: connection.url,
    })
    enqueueUpdate(connection, () => synchronize(connection))
  })

  connection.addEventListener("message", (event) => {
    const message = buildMessage(event.data)
    if (message === null) return
    console.debug("[@internal/rpc/service:update]", "получено уведомление об обновлении", {
      from: connection.url,
      packages: message.packages,
    })
    enqueueUpdate(connection, () => applyRelease(connection, message.packages))
  })

  connection.addEventListener("close", (event) => {
    socket = null
    const intentional = intentionalClosures.delete(connection)
    console.debug("[@internal/rpc/service]", "отключились от сервера обновлений", {
      code: event.code,
      intentional,
      reason: event.reason,
      wasClean: event.wasClean,
    })
    if (!intentional) setTimeout(connect, 1_000)
  })

  connection.addEventListener("error", (error) => {
    console.debug("[@internal/rpc/service]", "ошибка подключения к серверу обновлений", error)
    console.error("Ошибка WebSocket сервиса обновлений", error)
  })
}

/** Сверяет cache с последним доказанным package state после каждого reconnect. */
async function synchronize(connection: WebSocket) {
  const response = await fetch("/code", {cache: "no-store"})
  if (!response.ok) throw new Error(`Состояние пакетов недоступно: ${response.status}`)
  const state = await response.json() as {packages?: unknown}
  const message = releaseMessage({type: "release", packages: state.packages})
  if (message === null) throw new Error("Сервер вернул некорректное состояние пакетов")
  console.debug("[@internal/rpc/service:update]", "получено текущее состояние пакетов", {
    packages: message.packages,
  })
  await applyRelease(connection, message.packages)
}

/** Применяет одну package-группу и завершает прежний transport перед restart. */
async function applyRelease(connection: WebSocket, packages: ReleasedPackage[]) {
  try {
    console.debug("[@internal/rpc/service:update]", "обновление пакетов началось", {packages})
    const updated = await updateModules(packages)
    if (updated.length === 0) {
      console.debug("[@internal/rpc/service:update]", "кэш уже содержит доказанные версии", {
        packages: packages.map(({name, version}) => ({name, version})),
      })
      return
    }
    console.debug("[@internal/rpc/service:update]", "кэш пакетов обновлён", {packages: updated})
    console.debug("[@internal/rpc/service:update]", "закрываем прежнее подключение", {
      code: 1000,
      packages: updated,
    })
    intentionalClosures.add(connection)
    connection.close(1000, "release применён")
    console.debug("[@internal/rpc/service:update]", "перезагрузка страниц началась", {
      packages: updated,
    })
    await restartBrowser()
    console.debug("[@internal/rpc/service:update]", "перезагрузка страниц завершена", {
      packages: updated,
    })
  } catch (error) {
    console.debug("[@internal/rpc/service:update]", "обновление пакетов завершилось с ошибкой", {
      packages,
    }, error)
    console.error(`Не удалось обновить пакеты ${packages.map(({name}) => name).join(", ")}`, error)
    throw error
  }
}

/** Принимает только одно host notification с точным package state. */
function buildMessage(data: unknown): {type: "release", packages: ReleasedPackage[]} | null {
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
): {type: "release", packages: ReleasedPackage[]} | null {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null
  const input = message as Record<string, unknown>
  if (input.type !== "release" || !Array.isArray(input.packages) || input.packages.length === 0)
    return null

  const packages: ReleasedPackage[] = []
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

function enqueueUpdate(connection: WebSocket, update: () => Promise<void>) {
  updates = updates.then(update, update).catch((error) => {
    console.debug("[@internal/rpc/service:update]", "не удалось синхронизировать пакеты", error)
    console.error("Не удалось синхронизировать браузерные пакеты", error)
    if (connection.readyState === WebSocket.OPEN)
      setTimeout(() => enqueueUpdate(connection, () => synchronize(connection)), 1_000)
  })
}
