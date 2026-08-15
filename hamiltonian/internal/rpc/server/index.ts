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

/** HTTP routes, которыми владеет server-сторона RPC. */
export const routes = {
  /** Переводит HTTP request `/service` в RPC WebSocket. */
  service(request: Request, server: Bun.Server<RpcSocketData>) {
    if (server.upgrade(request, {data: {source: "rpc/service"}})) return
    return new Response("WebSocket upgrade required", {status: 426})
  },
}

/** Server handlers единственного RPC WebSocket transport. */
export const websocket: Bun.WebSocketHandler<RpcSocketData> = {
  open(socket) {
    console.info(`${socket.data.source} connected`)
  },
  message() {
  },
  close(socket) {
    console.info(`${socket.data.source} disconnected`)
  },
}
