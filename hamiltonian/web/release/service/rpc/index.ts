import {
  parseReleaseChangedMessage,
  parseReleaseDeltaMessage,
  releaseCurrentMessage,
  type ReleaseDelta,
} from "../../protocol"
import type {ReleasePackage} from "../state"

/** Release operations, которые запускаются по свежей server delta. */
export interface RpcBindings {
  currentPackages(): Promise<ReleasePackage[]>
  applyDelta(delta: ReleaseDelta): Promise<string[]>
  restartBrowser(): Promise<void>
}

interface SynchronizationState {
  awaitingDelta: boolean
  resynchronize: boolean
}

/** Запускает единственное RPC-подключение текущей Service Worker incarnation. */
export function startRpc(bindings: RpcBindings) {
  let socket: WebSocket | null = null
  let updates = Promise.resolve()
  const intentionalClosures = new WeakSet<WebSocket>()
  const states = new WeakMap<WebSocket, SynchronizationState>()

  const enqueueUpdate = (connection: WebSocket, update: () => Promise<void>) => {
    updates = updates.then(update, update).catch((error) => {
      const state = states.get(connection)
      if (state) state.awaitingDelta = false
      console.debug("[@release/service:rpc:update]", "не удалось синхронизировать пакеты", error)
      console.error("Не удалось синхронизировать браузерные пакеты", error)
      if (connection === socket && connection.readyState === WebSocket.OPEN)
        setTimeout(() => requestSynchronization(connection), 1_000)
    })
  }

  const requestSynchronization = (connection: WebSocket) => {
    const state = states.get(connection)
    if (!state || connection !== socket) return
    if (state.awaitingDelta) {
      state.resynchronize = true
      return
    }
    state.awaitingDelta = true
    enqueueUpdate(connection, async () => {
      if (connection !== socket || connection.readyState !== WebSocket.OPEN) return
      const current = await bindings.currentPackages()
      connection.send(JSON.stringify(releaseCurrentMessage(current)))
      console.debug("[@release/service:rpc:update]", "отправлено фактическое состояние кэша", {
        current,
        to: connection.url,
      })
    })
  }

  const applyDelta = async (connection: WebSocket, delta: ReleaseDelta) => {
    try {
      console.debug("[@release/service:rpc:update]", "получена delta браузерных пакетов", delta)
      const updated = await bindings.applyDelta(delta)
      if (updated.length === 0) {
        console.debug("[@release/service:rpc:update]", "кэш уже совпадает с server state")
        return
      }
      console.debug("[@release/service:rpc:update]", "кэш пакетов обновлён", {packages: updated})
      console.debug("[@release/service:rpc:update]", "закрываем прежнее подключение", {
        code: 1000,
        packages: updated,
      })
      intentionalClosures.add(connection)
      connection.close(1000, "release применён")
      console.debug("[@release/service:rpc:update]", "перезагрузка страниц началась", {
        packages: updated,
      })
      await bindings.restartBrowser()
      console.debug("[@release/service:rpc:update]", "перезагрузка страниц завершена", {
        packages: updated,
      })
    } catch (error) {
      console.debug("[@release/service:rpc:update]", "обновление пакетов завершилось с ошибкой", delta, error)
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
    if (socket && socket.readyState < WebSocket.CLOSING) return

    const url = new URL("/sw", location.origin)
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
    const connection = new WebSocket(url)
    const state: SynchronizationState = {awaitingDelta: false, resynchronize: false}
    socket = connection
    states.set(connection, state)
    console.debug("[@release/service:rpc]", "подключаемся к серверу обновлений", {
      from: location.origin,
      to: url.href,
    })

    connection.addEventListener("open", () => {
      console.debug("[@release/service:rpc]", "подключились к серверу обновлений", {
        to: connection.url,
      })
      requestSynchronization(connection)
    })

    connection.addEventListener("message", (event) => {
      const message = parseMessage(event.data)
      if (parseReleaseChangedMessage(message) !== null) {
        console.debug("[@release/service:rpc:update]", "получен сигнал об обновлении", {
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
      const intentional = intentionalClosures.delete(connection)
      console.debug("[@release/service:rpc]", "отключились от сервера обновлений", {
        code: event.code,
        intentional,
        reason: event.reason,
        wasClean: event.wasClean,
      })
      if (!intentional) setTimeout(connect, 1_000)
    })

    connection.addEventListener("error", (error) => {
      console.debug("[@release/service:rpc]", "ошибка подключения к серверу обновлений", error)
      console.error("Ошибка WebSocket сервиса обновлений", error)
    })
  }

  connect()
}

function parseMessage(data: unknown) {
  if (typeof data !== "string") return null
  try {
    return JSON.parse(data) as unknown
  } catch {
    return null
  }
}
