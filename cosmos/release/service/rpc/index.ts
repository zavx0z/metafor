import {parsePeerNetworkObservation, peerObservationRequest} from "../../shared/peer-observation"
import {
  parseReleaseChangedMessage,
  parseReleaseDeltaMessage,
  releaseCurrentMessage,
  type ReleaseDelta,
} from "../../shared/protocol"
import type {ReleasePackage} from "../cache/current"
import {observeSafely, type ReleaseObservation} from "../observation"

/** Service Worker release operations, запускаемые по свежей server delta. */
export interface RpcBindings {
  observation?: Pick<ReleaseObservation, "connection" | "text"> & Partial<Pick<ReleaseObservation, "peers">>
  currentPackages(): Promise<ReleasePackage[]>
  applyDelta(delta: ReleaseDelta): Promise<string[]>
}

interface SynchronizationState {
  awaitingDelta: boolean
  resynchronize: boolean
}

/** Живые ресурсы одного RPC runtime release. */
export interface RpcRuntime {
  destroy(): Promise<void>
}

/** Запускает единственное RPC-подключение текущей Service Worker incarnation. */
export function startRpc(bindings: RpcBindings) {
  let socket: WebSocket | null = null
  let updates = Promise.resolve()
  let destroyed = false
  let reconnecting = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const states = new WeakMap<WebSocket, SynchronizationState>()
  const connectionIds = new WeakMap<WebSocket, string>()
  const failedDeltas = new Set<string>()

  const schedule = (callback: () => void, delay: number) => {
    if (destroyed) return
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (!destroyed) callback()
    }, delay)
    timers.add(timer)
  }

  const enqueueUpdate = (connection: WebSocket, update: () => Promise<void>) => {
    updates = updates.then(update, update).catch((error) => {
      const state = states.get(connection)
      if (state) {state.awaitingDelta = false; state.resynchronize = false}
      console.error("[@cosmos/release:service:rpc:update]", "синхронизация завершилась с ошибкой", {
        error: errorMessage(error),
        to: connection.url,
        retryInMs: null,
        blocked: true,
      })
    })
  }

  const requestSynchronization = (connection: WebSocket) => {
    const state = states.get(connection)
    if (destroyed || !state || connection !== socket) return
    if (state.awaitingDelta) {
      state.resynchronize = true
      return
    }
    state.awaitingDelta = true
    enqueueUpdate(connection, async () => {
      if (connection !== socket || connection.readyState !== WebSocket.OPEN) return
      const current = await bindings.currentPackages()
      if (destroyed || connection !== socket || connection.readyState !== WebSocket.OPEN) return
      const message = JSON.stringify(releaseCurrentMessage(current))
      connection.send(message)
      observeSafely(() => bindings.observation?.text(connectionIds.get(connection)!, "send", message))
      console.debug("[@cosmos/release:service:rpc:update]", "фактическое состояние cache отправлено", {
        current,
        to: connection.url,
      })
    })
  }

  const applyDelta = async (delta: ReleaseDelta) => {
    console.debug("[@cosmos/release:service:rpc:update]", "server delta получена", {
      remove: delta.remove,
      update: delta.update,
    })
    const updated = await bindings.applyDelta(delta)
    if (updated.length === 0) {
      console.debug("[@cosmos/release:service:rpc:update]", "browser cache уже актуален", {
        remove: delta.remove.length,
        update: delta.update.length,
      })
      return
    }
  }

  const connect = () => {
    if (destroyed) return
    if (socket && socket.readyState < WebSocket.CLOSING) return

    const url = new URL("/sw", location.origin)
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const connection = new WebSocket(url)
    const connectionId = observeSafely(() => crypto.randomUUID()) ?? ""
    connectionIds.set(connection, connectionId)
    observeSafely(() => bindings.observation?.connection(connectionId, connection.url, "connecting"))
    const state: SynchronizationState = {awaitingDelta: false, resynchronize: false}
    socket = connection
    states.set(connection, state)
    connection.addEventListener("open", () => {
      observeSafely(() => bindings.observation?.connection(connectionId, connection.url, "open"))
      if (destroyed) return
      console.debug("[@cosmos/release:service:rpc]", "соединение с сервером обновлений установлено", {
        recovered: reconnecting,
        to: connection.url,
      })
      reconnecting = false
      requestSynchronization(connection)
      const observe=()=>{if(destroyed||connection!==socket||connection.readyState!==WebSocket.OPEN)return;const message=JSON.stringify(peerObservationRequest());connection.send(message);observeSafely(()=>bindings.observation?.text(connectionId,"send",message));schedule(observe,3000)}
      if(bindings.observation?.peers)observe()
    })

    connection.addEventListener("message", (event) => {
      if (typeof event.data === "string") observeSafely(() => bindings.observation?.text(connectionId, "receive", event.data))
      if (destroyed) return
      const message = parseMessage(event.data)
      const peers=parsePeerNetworkObservation(message)
      if(peers){observeSafely(()=>bindings.observation?.peers?.(peers));return}
      if (parseReleaseChangedMessage(message) !== null) {
        console.debug("[@cosmos/release:service:rpc:update]", "получен сигнал об обновлении", {
          from: connection.url,
        })
        requestSynchronization(connection)
        return
      }

      const delta = parseReleaseDeltaMessage(message)
      if (delta === null || !state.awaitingDelta) return
      state.awaitingDelta = false
      enqueueUpdate(connection, async () => {
        if (destroyed || connection !== socket) return
        const fingerprint = JSON.stringify({update: delta.update.map(identityFingerprint).sort(), remove: delta.remove.map(identityFingerprint).sort()})
        if (failedDeltas.has(fingerprint)) {state.resynchronize = false; return}
        try {await applyDelta(delta)}
        catch (error) {
          failedDeltas.add(fingerprint)
          if (failedDeltas.size > 64) failedDeltas.delete(failedDeltas.values().next().value!)
          throw error
        }
        if (state.resynchronize && connection === socket) {
          state.resynchronize = false
          requestSynchronization(connection)
        }
      })
    })

    connection.addEventListener("close", (event) => {
      observeSafely(() => bindings.observation?.connection(connectionId, connection.url, "closed"))
      if (socket === connection) socket = null
      if (destroyed || !reconnecting) {
        console.debug("[@cosmos/release:service:rpc]", "соединение с сервером обновлений закрыто", {
          code: event.code,
          intentional: destroyed,
          reason: event.reason,
          retryInMs: destroyed ? null : 1_000,
          wasClean: event.wasClean,
        })
      }
      reconnecting = !destroyed
      if (!destroyed) schedule(connect, 1_000)
    })

    connection.addEventListener("error", (error) => {
      observeSafely(() => bindings.observation?.connection(connectionId, connection.url, "error"))
      if (reconnecting) return
      reconnecting = true
      console.error("[@cosmos/release:service:rpc]", "соединение с сервером обновлений завершилось с ошибкой", {
        error: errorMessage(error),
        retryInMs: 1_000,
        to: connection.url,
      })
    })
  }

  connect()

  return Object.freeze({
    async destroy() {
      if (destroyed) return
      destroyed = true
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      const connection = socket
      socket = null
      if (connection && connection.readyState < WebSocket.CLOSING) {
        observeSafely(() => bindings.observation?.connection(connectionIds.get(connection)!, connection.url, "closing"))
        connection.close(1000, "release runtime destroyed")
      }
    },
  }) satisfies RpcRuntime
}

function identityFingerprint(entry: ReleaseDelta["update"][number] | ReleaseDelta["remove"][number]) {
  return JSON.stringify([entry.name, entry.env, entry.artifact ?? null, entry.version, "sha256" in entry ? entry.sha256 : null, "size" in entry ? entry.size : null])
}

function parseMessage(data: unknown) {
  if (typeof data !== "string") return null
  try {
    return JSON.parse(data) as unknown
  } catch {
    return null
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
