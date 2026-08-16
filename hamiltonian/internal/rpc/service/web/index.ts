/**
 * Web-реализация RPC service для Service Worker.
 *
 * Загруженный importer запускает artifact один раз за текущую инкарнацию
 * Worker. Service открывает WebSocket исходного origin; transport protocol
 * повторяет security context страницы.
 *
 * @packageDocumentation
 */

declare const updateModules: (modules: string[]) => Promise<void>
declare const restartBrowser: () => Promise<void>

let socket: WebSocket | null = null

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
  })

  connection.addEventListener("message", (event) => {
    const message = buildMessage(event.data)
    if (message === null) return
    console.debug("[@internal/rpc/service:update]", "получено уведомление об обновлении", {
      from: connection.url,
      modules: message.modules,
    })
    void applyBuild(connection, message.modules)
  })

  connection.addEventListener("close", (event) => {
    socket = null
    console.debug("[@internal/rpc/service]", "отключились от сервера обновлений", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    })
  })

  connection.addEventListener("error", (error) => {
    console.debug("[@internal/rpc/service]", "ошибка подключения к серверу обновлений", error)
    console.error("Ошибка WebSocket сервиса обновлений", error)
  })
}

/** Применяет одну build-группу и завершает прежний transport перед restart. */
async function applyBuild(connection: WebSocket, modules: string[]) {
  try {
    console.debug("[@internal/rpc/service:update]", "обновление модулей началось", {modules})
    await updateModules(modules)
    console.debug("[@internal/rpc/service:update]", "кэш модулей обновлён", {modules})
    console.debug("[@internal/rpc/service:update]", "закрываем прежнее подключение", {
      code: 1000,
      modules,
    })
    connection.close(1000, "обновление модулей")
    console.debug("[@internal/rpc/service:update]", "перезагрузка страниц началась", {modules})
    await restartBrowser()
    console.debug("[@internal/rpc/service:update]", "перезагрузка страниц завершена", {modules})
  } catch (error) {
    console.debug("[@internal/rpc/service:update]", "обновление модулей завершилось с ошибкой", {
      modules,
    }, error)
    console.error(`Не удалось обновить модули ${modules.join(", ")}`, error)
  }
}

/** Принимает только одно host notification с непустым массивом packages. */
function buildMessage(data: unknown): {type: "build", modules: string[]} | null {
  if (typeof data !== "string") return null

  let message: unknown
  try {
    message = JSON.parse(data)
  } catch {
    return null
  }

  if (
    typeof message !== "object"
    || message === null
    || !("type" in message)
    || message.type !== "build"
    || !("modules" in message)
    || !Array.isArray(message.modules)
    || message.modules.length === 0
    || !message.modules.every((module) => typeof module === "string")
  ) return null

  return {type: "build", modules: [...new Set(message.modules)]}
}
