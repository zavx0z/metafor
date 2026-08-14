let socket: WebSocket | null = null

addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(skipWaiting())
})

addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(clients.claim())
})

addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "connect") connect()
})

function connect() {
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
