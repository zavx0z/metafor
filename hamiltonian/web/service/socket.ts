let socket: WebSocket | null = null

/**
 * Открывает единственный control WebSocket текущей Service Worker инкарнации.
 *
 * Повторный вызов ничего не делает, пока socket находится в `CONNECTING` или
 * `OPEN`. После `close` ссылка освобождается, но автоматического reconnect нет.
 * Transport protocol повторяет security context origin: `ws` для HTTP и `wss`
 * для HTTPS.
 */
export function connect() {
  if (socket && socket.readyState < WebSocket.CLOSING) return

  const url = new URL("/service", location.origin)
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
  socket = new WebSocket(url)

  socket.addEventListener("open", () => {
    console.info("web/service websocket connected")
  })

  socket.addEventListener("close", () => {
    socket = null
    console.info("web/service websocket disconnected")
  })

  socket.addEventListener("error", (error) => {
    console.error("web/service websocket error", error)
  })
}
