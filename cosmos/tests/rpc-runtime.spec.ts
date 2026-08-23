import {expect, test} from "bun:test"
import {startRpc} from "../release/service/rpc"
import {captureDiagnostics} from "./fixture/diagnostics"

test.serial("release RPC diagnostics expose no-op and suppress reconnect spam", async () => {
  const globals = installRpcGlobals()
  try {
    const applied: unknown[] = []
    const {diagnostics} = await captureDiagnostics(async () => {
      const rpc = startRpc({
        currentPackages: async () => [],
        applyDelta: async (delta) => {
          applied.push(delta)
          return []
        },
        restartBrowser: async () => {
          throw new Error("No-op delta must not restart Window")
        },
      })

      const initial = globals.sockets[0]
      if (!initial) throw new Error("Initial RPC socket was not created")
      initial.open()
      await settle()
      initial.message(JSON.stringify({type: "release-delta", update: [], remove: []}))
      await settle()

      initial.disconnect(1006, "network lost", false)
      globals.flushTimers()
      const failed = globals.sockets[1]
      if (!failed) throw new Error("First reconnect socket was not created")
      failed.fail()
      globals.flushTimers()
      const recovered = globals.sockets[2]
      if (!recovered) throw new Error("Second reconnect socket was not created")
      recovered.open()
      await settle()
      await rpc.destroy()
    })

    expect(applied).toEqual([{type: "release-delta", update: [], remove: []}])
    expect(diagnostics.map(({level, event}) => `${level}:${String(event)}`)).toEqual([
      "debug:соединение с сервером обновлений установлено",
      "debug:фактическое состояние cache отправлено",
      "debug:server delta получена",
      "debug:browser cache уже актуален",
      "debug:соединение с сервером обновлений закрыто",
      "debug:соединение с сервером обновлений установлено",
      "debug:фактическое состояние cache отправлено",
      "debug:соединение с сервером обновлений закрыто",
    ])
    expect(diagnostics[0]?.details).toEqual(expect.objectContaining({recovered: false}))
    expect(diagnostics[4]?.details).toEqual(expect.objectContaining({
      intentional: false,
      retryInMs: 1_000,
    }))
    expect(diagnostics[5]?.details).toEqual(expect.objectContaining({recovered: true}))
    expect(diagnostics.at(-1)?.details).toEqual(expect.objectContaining({intentional: true}))
  } finally {
    globals.restore()
  }
})

test.serial("release RPC diagnostics report one connection failure until recovery", async () => {
  const globals = installRpcGlobals()
  try {
    const {diagnostics} = await captureDiagnostics(async () => {
      const rpc = startRpc({
        currentPackages: async () => [],
        applyDelta: async () => [],
        restartBrowser: async () => {},
      })

      globals.sockets[0]?.fail()
      globals.flushTimers()
      globals.sockets[1]?.fail()
      globals.flushTimers()
      globals.sockets[2]?.open()
      await settle()
      await rpc.destroy()
    })

    expect(diagnostics.map(({level, event}) => `${level}:${String(event)}`)).toEqual([
      "error:соединение с сервером обновлений завершилось с ошибкой",
      "debug:соединение с сервером обновлений установлено",
      "debug:фактическое состояние cache отправлено",
      "debug:соединение с сервером обновлений закрыто",
    ])
    expect(diagnostics[0]?.details).toEqual(expect.objectContaining({retryInMs: 1_000}))
    expect(diagnostics[1]?.details).toEqual(expect.objectContaining({recovered: true}))
  } finally {
    globals.restore()
  }
})

test.serial("release RPC diagnostics preserve the exact synchronization failure", async () => {
  const globals = installRpcGlobals()
  try {
    const {diagnostics} = await captureDiagnostics(async () => {
      const rpc = startRpc({
        currentPackages: async () => [],
        applyDelta: async () => {
          throw new Error("candidate digest mismatch")
        },
        restartBrowser: async () => {},
      })
      const connection = globals.sockets[0]
      if (!connection) throw new Error("Initial RPC socket was not created")
      connection.open()
      await settle()
      connection.message(JSON.stringify({type: "release-delta", update: [], remove: []}))
      await settle()
      await rpc.destroy()
    })

    expect(diagnostics.map(({level, event}) => `${level}:${String(event)}`)).toEqual([
      "debug:соединение с сервером обновлений установлено",
      "debug:фактическое состояние cache отправлено",
      "debug:server delta получена",
      "error:синхронизация завершилась с ошибкой",
      "debug:соединение с сервером обновлений закрыто",
    ])
    expect(diagnostics[3]?.details).toEqual(expect.objectContaining({
      error: "candidate digest mismatch",
    }))
  } finally {
    globals.restore()
  }
})

class FixtureWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static sockets: FixtureWebSocket[] = []

  readonly url: string
  readonly sent: string[] = []
  readyState = FixtureWebSocket.CONNECTING

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FixtureWebSocket.sockets.push(this)
  }

  send(message: string) {
    this.sent.push(message)
  }

  open() {
    this.readyState = FixtureWebSocket.OPEN
    this.dispatchEvent(new Event("open"))
  }

  message(data: string) {
    const event = new Event("message")
    Object.defineProperty(event, "data", {value: data})
    this.dispatchEvent(event)
  }

  fail() {
    this.dispatchEvent(new Event("error"))
    this.disconnect(1006, "failed reconnect", false)
  }

  close(code = 1000, reason = "") {
    this.disconnect(code, reason, true)
  }

  disconnect(code: number, reason: string, wasClean: boolean) {
    this.readyState = FixtureWebSocket.CLOSED
    const event = new Event("close")
    for (const [name, value] of Object.entries({code, reason, wasClean}))
      Object.defineProperty(event, name, {value})
    this.dispatchEvent(event)
  }
}

function installRpcGlobals() {
  const descriptors = new Map<string, PropertyDescriptor | undefined>()
  const timers = new Map<number, () => void>()
  let nextTimer = 1
  FixtureWebSocket.sockets = []

  const values = {
    WebSocket: FixtureWebSocket,
    location: new URL("https://rpc.test/"),
    setTimeout: ((callback: () => void) => {
      const id = nextTimer++
      timers.set(id, callback)
      return id
    }) as typeof setTimeout,
    clearTimeout: ((id: number) => {
      timers.delete(id)
    }) as typeof clearTimeout,
  }
  for (const [name, value] of Object.entries(values)) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {configurable: true, value, writable: true})
  }

  return {
    sockets: FixtureWebSocket.sockets,
    flushTimers() {
      const callbacks = [...timers.values()]
      timers.clear()
      for (const callback of callbacks) callback()
    },
    restore() {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete (globalThis as Record<string, unknown>)[name]
      }
      FixtureWebSocket.sockets = []
    },
  }
}

async function settle() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve()
}
