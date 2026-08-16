/**
 * Bun-сторона RPC Hamiltonian.
 *
 * Модуль владеет HTTP upgrade route и WebSocket handlers. Корневой Hamiltonian
 * server размещает предоставленные bindings в единственном `Bun.serve`, а
 * Web-реализация RPC остаётся у `service/web`.
 *
 * @packageDocumentation
 */

/** Данные одного подключённого RPC service. */
export interface RpcSocketData {
  source: "rpc/service"
}

/** Общая тема сообщений host для подключённых RPC services. */
export const rpcServiceTopic = "rpc/service"

/** Переводит HTTP request `/sw` в RPC WebSocket. */
export const sw = (request: Request, server: Bun.Server<RpcSocketData>) => {
  if (server.upgrade(request, {data: {source: "rpc/service"}})) return
  return new Response("WebSocket upgrade required", {status: 426})
}

/** Server handlers единственного RPC WebSocket transport. */
export const websocket: Bun.WebSocketHandler<RpcSocketData> = {
  open(socket) {
    socket.subscribe(rpcServiceTopic)
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[@internal/rpc/server]", "Service Worker подключён", {
        source: socket.data.source,
        topic: rpcServiceTopic,
      })
    }
  },
  message() {},
  close(socket, code, reason) {
    socket.unsubscribe(rpcServiceTopic)
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[@internal/rpc/server]", "Service Worker отключён", {
        code,
        reason,
        source: socket.data.source,
        topic: rpcServiceTopic,
      })
    }
  },
}
