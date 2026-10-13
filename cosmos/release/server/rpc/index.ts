import {release} from "../services"
const {readDesiredBrowserArtifacts} = release
import {
  parseReleaseCurrentMessage,
  releaseDeltaMessage,
} from "../../shared/protocol"
import type {BrowserPackageArtifactIdentity} from "@metafor/tech-build/identity"
import {releaseDelta} from "../release/delta"
import type {RendezvousSession} from "@metafor/tech-peer/rendezvous"
import type {DarkRuntimeSocketData} from "../../../../quantum/dark/types/runtime"
import type {AgentBrowserSocketData} from "../agents-browser"
import type {ClientSocketData} from "../clients"


/** Данные одного подключённого release env `service`. */
export interface RpcSocketData {
  source: "release/service"
  /** Assigned only by the native listener; absent denies telemetry reads. */
  observation?: "viewer" | "publisher"
}

/** Раздельные RPC и выданные signaling handler сессии одного release-owned listener. */
export type ReleaseServerSocketData = RpcSocketData | RendezvousSession | DarkRuntimeSocketData | AgentBrowserSocketData | ClientSocketData

/** Общая тема серверных сообщений для release services. */
export const rpcServiceTopic = "release/service"

/** Переводит HTTP request `/sw` в RPC WebSocket. */
export function upgradeRpc(request: Request, server: Pick<Bun.Server<RpcSocketData>, "upgrade">) {
  if (server.upgrade(request, {data: {source: "release/service"}})) return
  return new Response("WebSocket upgrade required", {status: 426})
}

/** Подключает release service к общей теме обновлений. */
export function openRpc(socket: Bun.ServerWebSocket<RpcSocketData>) {
  socket.subscribe(rpcServiceTopic)
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[@cosmos/release:server:rpc]", "подписка release service создана", {
      source: socket.data.source,
      topic: rpcServiceTopic,
    })
  }
}

/** Принимает фактический browser current и отвечает только update/remove delta. */
export async function messageRpc(
  socket: Bun.ServerWebSocket<RpcSocketData>,
  message: string | Buffer,
  desired: () => Promise<BrowserPackageArtifactIdentity[]> | readonly BrowserPackageArtifactIdentity[] =
    readDesiredBrowserArtifacts,
) {
  const current = parseReleaseCurrentMessage(parseMessage(message))
  if (current === null) {
    socket.close(1008, "invalid release current")
    return
  }

  try {
    const response = releaseDeltaMessage(releaseDelta([...(await desired())], current.current))
    socket.send(JSON.stringify(response))
    if (Bun.env.NODE_ENV === "development") {
      console.debug("[@cosmos/release:server:rpc:update]", "состояние browser cache сверено", {
        current: current.current,
        remove: response.remove,
        update: response.update,
      })
    }
  } catch (error) {
    console.error("[@cosmos/release:server:rpc:update]", "сверка browser cache завершилась с ошибкой", {
      error: errorMessage(error),
      source: socket.data.source,
    })
    socket.close(1011, "release state unavailable")
  }
}

/** Отключает release service от общей темы обновлений. */
export function closeRpc(
  socket: Bun.ServerWebSocket<RpcSocketData>,
  code: number,
  reason: string,
) {
  socket.unsubscribe(rpcServiceTopic)
  if (Bun.env.NODE_ENV === "development") {
    console.debug("[@cosmos/release:server:rpc]", "подписка release service удалена", {
      code,
      reason,
      source: socket.data.source,
      topic: rpcServiceTopic,
    })
  }
}

function parseMessage(message: string | Buffer) {
  try {
    return JSON.parse(typeof message === "string" ? message : message.toString()) as unknown
  } catch {
    return null
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
