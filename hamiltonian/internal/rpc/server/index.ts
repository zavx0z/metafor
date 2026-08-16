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
    console.info(`${socket.data.source} connected`)
  },
  message() {},
  close(socket) {
    socket.unsubscribe(rpcServiceTopic)
    console.info(`${socket.data.source} disconnected`)
  },
}
