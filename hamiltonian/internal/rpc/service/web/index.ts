/**
 * Web-реализация RPC service для Service Worker.
 *
 * Загруженный importer запускает artifact один раз за текущую инкарнацию
 * Worker. Service открывает WebSocket исходного origin; transport protocol
 * повторяет security context страницы.
 *
 * @packageDocumentation
 */

declare const updateModule: (module: string) => Promise<void>

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
    console.info("rpc/service websocket connected")
  })

  connection.addEventListener("message", (event) => {
    const message = buildMessage(event.data)
    if (message === null) return
    void updateModule(message.module).then(
      () => console.info(`rpc/service updated ${message.module}`),
      (error) => console.error(`rpc/service update failed ${message.module}`, error),
    )
  })

  connection.addEventListener("close", () => {
    socket = null
    console.info("rpc/service websocket disconnected")
  })

  connection.addEventListener("error", (error) => {
    console.error("rpc/service websocket error", error)
  })
}

/** Принимает только host notification об успешной сборке package. */
function buildMessage(data: unknown): {type: "build", module: string} | null {
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
    || !("module" in message)
    || typeof message.module !== "string"
  ) return null

  return {type: "build", module: message.module}
}
