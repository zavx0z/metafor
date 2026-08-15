/**
 * Web-реализация RPC service для Service Worker.
 *
 * Загруженный importer запускает artifact один раз за текущую инкарнацию
 * Worker. Service открывает WebSocket исходного origin; transport protocol
 * повторяет security context страницы.
 *
 * @packageDocumentation
 */

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
    connection.send("ping")

    const interval = setInterval(() => connection.send("ping"), 20_000)
    connection.addEventListener("close", () => clearInterval(interval), {once: true})
  })

  connection.addEventListener("message", (event) => {
    if (event.data !== "pong") return
    console.info("rpc/service websocket pong")
  })

  connection.addEventListener("close", () => {
    socket = null
    console.info("rpc/service websocket disconnected")
  })

  connection.addEventListener("error", (error) => {
    console.error("rpc/service websocket error", error)
  })
}
