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

  connection.addEventListener("open", () => {
    console.debug("rpc/service websocket connected")
  })

  connection.addEventListener("message", (event) => {
    const message = buildMessage(event.data)
    if (message === null) return
    void applyBuild(connection, message.modules)
  })

  connection.addEventListener("close", () => {
    socket = null
    console.debug("rpc/service websocket disconnected")
  })

  connection.addEventListener("error", (error) => {
    console.error("rpc/service websocket error", error)
  })
}

/** Применяет одну build-группу и завершает прежний transport перед restart. */
async function applyBuild(connection: WebSocket, modules: string[]) {
  try {
    await updateModules(modules)
    connection.close(1000, "browser update")
    await restartBrowser()
  } catch (error) {
    console.error(`rpc/service update failed ${modules.join(", ")}`, error)
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
