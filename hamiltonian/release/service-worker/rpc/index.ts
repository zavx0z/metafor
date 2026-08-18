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
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "не удалось синхронизировать пакеты", error)
      console.error("Не удалось синхронизировать браузерные пакеты", error)
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
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "отправлено фактическое состояние кэша", {
        current,
        to: connection.url,
      })
    })
  }

  const applyDelta = async (connection: WebSocket, delta: ReleaseDelta) => {
    try {
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "получена delta браузерных пакетов", delta)
      const updated = await bindings.applyDelta(delta)
      if (updated.length === 0) {
        console.debug("[@hamiltonian/release:service-worker:rpc:update]", "кэш уже совпадает с server state")
        return
      }
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "кэш пакетов обновлён", {packages: updated})
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "перезагрузка страниц началась", {
        packages: updated,
      })
      await bindings.restartBrowser()
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "перезагрузка страниц завершена", {
        packages: updated,
      })
    } catch (error) {
      console.debug("[@hamiltonian/release:service-worker:rpc:update]", "обновление пакетов завершилось с ошибкой", delta, error)
      console.error(
        `Не удалось обновить пакеты ${[
          ...delta.update.map(({name}) => name),
          ...delta.remove.map(({name}) => name),
        ].join(", ")}`,
        error,
      )
      throw error
    }
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
    console.debug("[@hamiltonian/release:service-worker:rpc]", "подключаемся к серверу обновлений", {
      from: location.origin,
      to: url.href,
    })

    connection.addEventListener("open", () => {
      if (destroyed) return
      console.debug("[@hamiltonian/release:service-worker:rpc]", "подключились к серверу обновлений", {
        to: connection.url,
      })
      requestSynchronization(connection)
    })

    connection.addEventListener("message", (event) => {
      if (destroyed) return
      const message = parseMessage(event.data)
      if (parseReleaseChangedMessage(message) !== null) {
        console.debug("[@hamiltonian/release:service-worker:rpc:update]", "получен сигнал об обновлении", {
          from: connection.url,
        })
        requestSynchronization(connection)
        return
      }

      const delta = parseReleaseDeltaMessage(message)
      if (delta === null || !state.awaitingDelta) return
      state.awaitingDelta = false
      enqueueUpdate(connection, async () => {
        await applyDelta(connection, delta)
        if (state.resynchronize && connection === socket) {
          state.resynchronize = false
          requestSynchronization(connection)
        }
      })
    })

    connection.addEventListener("close", (event) => {
      if (socket === connection) socket = null
      console.debug("[@hamiltonian/release:service-worker:rpc]", "отключились от сервера обновлений", {
        code: event.code,
        intentional: destroyed,
        reason: event.reason,
        wasClean: event.wasClean,
      })
      if (!destroyed) schedule(connect, 1_000)
    })

    connection.addEventListener("error", (error) => {
      console.debug("[@hamiltonian/release:service-worker:rpc]", "ошибка подключения к серверу обновлений", error)
      console.error("Ошибка WebSocket сервиса обновлений", error)
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
