import {
  parseReleaseChangedMessage,
  parseReleaseDeltaMessage,
  releaseCurrentMessage,
  type ReleaseDelta,
} from "../../shared/protocol"
import type {ReleasePackage} from "../cache/current"

/** Service Worker release operations, запускаемые по свежей server delta. */
export interface RpcBindings {
  currentPackages(): Promise<ReleasePackage[]>
  applyDelta(delta: ReleaseDelta): Promise<string[]>
  restartBrowser(): Promise<void>
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
      if (state) state.awaitingDelta = false
      console.error("[@hamiltonian/release:service:rpc:update]", "синхронизация завершилась с ошибкой", {
        error: errorMessage(error),
        to: connection.url,
      })
      if (!destroyed && connection === socket && connection.readyState === WebSocket.OPEN)
        schedule(() => requestSynchronization(connection), 1_000)
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
      connection.send(JSON.stringify(releaseCurrentMessage(current)))
      console.debug("[@hamiltonian/release:service:rpc:update]", "фактическое состояние cache отправлено", {
        current,
        to: connection.url,
      })
    })
  }

  const applyDelta = async (delta: ReleaseDelta) => {
    console.debug("[@hamiltonian/release:service:rpc:update]", "server delta получена", {
      remove: delta.remove,
      update: delta.update,
    })
    const updated = await bindings.applyDelta(delta)
    if (updated.length === 0) {
      console.debug("[@hamiltonian/release:service:rpc:update]", "browser cache уже актуален", {
        remove: delta.remove.length,
        update: delta.update.length,
      })
      return
    }
    await bindings.restartBrowser()
  }

  const connect = () => {
    if (destroyed) return
    if (socket && socket.readyState < WebSocket.CLOSING) return

    const url = new URL("/sw", location.origin)
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const connection = new WebSocket(url)
    const state: SynchronizationState = {awaitingDelta: false, resynchronize: false}
    socket = connection
    states.set(connection, state)
    connection.addEventListener("open", () => {
      if (destroyed) return
      console.debug("[@hamiltonian/release:service:rpc]", "соединение с сервером обновлений установлено", {
        recovered: reconnecting,
        to: connection.url,
      })
      reconnecting = false
      requestSynchronization(connection)
    })

    connection.addEventListener("message", (event) => {
      if (destroyed) return
      const message = parseMessage(event.data)
      if (parseReleaseChangedMessage(message) !== null) {
        console.debug("[@hamiltonian/release:service:rpc:update]", "получен сигнал об обновлении", {
          from: connection.url,
        })
        requestSynchronization(connection)
        return
      }

      const delta = parseReleaseDeltaMessage(message)
      if (delta === null || !state.awaitingDelta) return
      state.awaitingDelta = false
      enqueueUpdate(connection, async () => {
        await applyDelta(delta)
        if (state.resynchronize && connection === socket) {
          state.resynchronize = false
          requestSynchronization(connection)
        }
      })
    })

    connection.addEventListener("close", (event) => {
      if (socket === connection) socket = null
      if (destroyed || !reconnecting) {
        console.debug("[@hamiltonian/release:service:rpc]", "соединение с сервером обновлений закрыто", {
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
      if (reconnecting) return
      reconnecting = true
      console.error("[@hamiltonian/release:service:rpc]", "соединение с сервером обновлений завершилось с ошибкой", {
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
      if (connection && connection.readyState < WebSocket.CLOSING)
        connection.close(1000, "release runtime destroyed")
    },
  }) satisfies RpcRuntime
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
