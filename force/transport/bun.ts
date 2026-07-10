import type {ForceMessage} from "@metafor/types/force/message"
import {
  forceReplayPath,
  parseForceReplayBeginPath,
  parseForceReplayEndPath,
  parseForceReplayPath,
} from "@metafor/types/force/replay"
import {ForceBase} from "../core/base"

const FORCE_DEFAULT_ADDRESS = "ws://127.0.0.1:4000/ws"

type ForceOptions = {
  /** Forward replay traffic for other ids of the same domain to onImpulse. */
  relayReplay?: boolean
}

const sameClient = (
  address: {domain: string; id: string} | null,
  domain: string,
  id: string,
): boolean => address?.domain === domain && address.id === id

export class Force extends ForceBase {
  static #instance: Force | undefined
  static #hooksInstalled = false
  static #shutdown: Promise<void> | undefined

  #address: string
  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #receiving: Promise<void> = Promise.resolve()
  #closed = false
  #outbox: ForceMessage[] = []
  #replayPending: boolean
  #relayReplay: boolean
  override onImpulse: (impulse: ForceMessage) => void | Promise<void> = () => {}
  override onReplayStart?: (requestPath: string) => void | Promise<void>
  override onReady?: () => void | Promise<void>
  override onDestroy?: () => void | Promise<void>
  override readonly id: string

  constructor(override readonly domain: string, options: ForceOptions = {}) {
    super()
    this.id = `${domain}-local`
    this.#address = Bun.env.FORCE_ADDRESS?.trim() || FORCE_DEFAULT_ADDRESS
    this.#replayPending = domain !== "dark"
    this.#relayReplay = options.relayReplay === true
    if (Force.#instance) Force.#instance.#closeTransport()
    Force.#instance = this
    Force.#shutdown = undefined
    if (!Force.#hooksInstalled) {
      Force.#hooksInstalled = true
      process.once("beforeExit", () => {
        Force.#shutdown ??= Force.#instance ? Force.#instance.#destroy() : Promise.resolve()
        void Force.#shutdown
      })
      process.once("SIGINT", () => {
        Force.#shutdown ??= Force.#instance ? Force.#instance.#destroy() : Promise.resolve()
        void Force.#shutdown.finally(() => process.exit(130))
      })
      process.once("SIGTERM", () => {
        Force.#shutdown ??= Force.#instance ? Force.#instance.#destroy() : Promise.resolve()
        void Force.#shutdown.finally(() => process.exit(143))
      })
    }
    this.#socket = this.#connect()
  }

  #connect(): WebSocket {
    const socket = new WebSocket(this.#address)
    socket.onopen = () => {
      socket.send(JSON.stringify({type: "register", domain: this.domain, id: this.id}))
      console.log(`[${this.domain}] connected to Force`)
      this.#replayPending = this.domain !== "dark"
      if (this.#replayPending) {
        socket.send(JSON.stringify({
          parts: [{part: "z", op: "test", path: forceReplayPath(this.domain, this.id)}],
        } satisfies ForceMessage))
      } else {
        this.#flushOutbox(socket)
        this.#enqueue(async () => this.onReady?.())
      }
    }
    socket.onmessage = (event) => {
      const data = event.data
      const text = typeof data === "string"
        ? data
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : ArrayBuffer.isView(data)
            ? new TextDecoder().decode(data)
            : String(data)
      let impulse: unknown
      try {
        impulse = JSON.parse(text) as unknown
      } catch {
        return
      }
      if (
        typeof impulse !== "object" ||
        impulse === null ||
        (impulse as {type?: unknown}).type !== undefined ||
        !Array.isArray((impulse as {parts?: unknown}).parts) ||
        (impulse as {parts: unknown[]}).parts.length !== 1
      ) return

      const message = impulse as ForceMessage
      const part = message.parts[0]
      const replaySource = typeof part.from === "string" ? parseForceReplayPath(part.from) : null
      if (replaySource && !sameClient(replaySource, this.domain, this.id)) {
        if (this.#relayReplay && replaySource.domain === this.domain) this.#enqueue(() => this.onImpulse(message))
        return
      }

      const begin = parseForceReplayBeginPath(part.path)
      if (begin && !sameClient(begin, this.domain, this.id)) {
        if (this.#relayReplay && begin.domain === this.domain) this.#enqueue(() => this.onImpulse(message))
        return
      }
      if (begin) {
        this.#replayPending = true
        const requestPath = forceReplayPath(this.domain, this.id)
        this.#enqueue(async () => this.onReplayStart?.(requestPath))
        return
      }

      const end = parseForceReplayEndPath(part.path)
      if (end && !sameClient(end, this.domain, this.id)) {
        if (this.#relayReplay && end.domain === this.domain) this.#enqueue(() => this.onImpulse(message))
        return
      }
      if (end) {
        this.#enqueue(async () => {
          this.#replayPending = false
          this.#flushOutbox(socket)
          await this.onReady?.()
        })
        return
      }

      this.#enqueue(() => this.onImpulse(message))
    }
    socket.onclose = () => this.#reconnect()
    socket.onerror = () => socket.close()
    return socket
  }

  override impulse(message: ForceMessage): void {
    if (this.#socket.readyState !== WebSocket.OPEN || this.#replayPending) {
      this.#outbox.push(message)
      return
    }
    this.#socket.send(JSON.stringify(message))
  }

  #flushOutbox(socket = this.#socket): void {
    if (this.#replayPending || socket.readyState !== WebSocket.OPEN) return
    while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(this.#outbox.shift()))
    }
  }

  #enqueue(task: () => void | Promise<void>): void {
    this.#receiving = this.#receiving.then(task).catch((error) => {
      console.error(`[${this.domain}] Force receive lifecycle failed`, error)
    })
  }

  #closeTransport(): void {
    this.#closed = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    this.#socket.close()
  }

  async #destroy(): Promise<void> {
    this.#closeTransport()
    try {
      await this.#receiving
      if (this.onDestroy) await this.onDestroy()
    } catch (error) {
      console.error(`[${this.domain}] Force onDestroy failed`, error)
    } finally {
      if (Force.#instance === this) Force.#instance = undefined
    }
  }

  #reconnect(): void {
    if (this.#closed) return
    if (Bun.env.FORCE_RECONNECT === "0") return
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      this.#socket = this.#connect()
    }, 500)
  }
}
