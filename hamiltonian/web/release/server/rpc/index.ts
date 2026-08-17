/** Данные одного подключённого release service. */
export interface RpcSocketData {
  source: "release/service"
}

/** Общая тема серверных сообщений для release services. */
export const rpcServiceTopic = "release/service"

/** Переводит HTTP request `/sw` в RPC WebSocket. */
export function upgradeRpc(request: Request, server: Bun.Server<RpcSocketData>) {
  if (server.upgrade(request, {data: {source: "release/service"}})) return
  return new Response("WebSocket upgrade required", {status: 426})
}

/** Подключает release service к общей теме обновлений. */
export function openRpc(socket: Bun.ServerWebSocket<RpcSocketData>) {
  socket.subscribe(rpcServiceTopic)
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[@release/server:rpc]", "Service Worker подключён к серверу обновлений", {
      source: socket.data.source,
      topic: rpcServiceTopic,
    })
  }
}

/** Принимает будущие управляющие сообщения release service. */
export function messageRpc(
  _socket: Bun.ServerWebSocket<RpcSocketData>,
  _message: string | Buffer,
) {}

/** Отключает release service от общей темы обновлений. */
export function closeRpc(
  socket: Bun.ServerWebSocket<RpcSocketData>,
  code: number,
  reason: string,
) {
  socket.unsubscribe(rpcServiceTopic)
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[@release/server:rpc]", "Service Worker отключён от сервера обновлений", {
      code,
      reason,
      source: socket.data.source,
      topic: rpcServiceTopic,
    })
  }
}
