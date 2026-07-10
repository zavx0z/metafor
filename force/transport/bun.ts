import type {ForceMessage} from "@metafor/types/force/message"
import {forceReplayPath} from "@metafor/types/force/replay"
import {ForceBase} from "../core/base"

const FORCE_DEFAULT_ADDRESS = "ws://127.0.0.1:4000/ws"

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
  override onImpulse: (impulse: ForceMessage) => void | Promise<void> = () => {}
  override onDestroy?: () => void | Promise<void>
  override readonly id: string

  constructor(override readonly domain: string) {
    super()
    this.id = `${domain}-local`
    this.#address = Bun.env.FORCE_ADDRESS?.trim() || FORCE_DEFAULT_ADDRESS
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
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(this.#outbox.shift()))
      }
      socket.send(JSON.stringify({
        parts: [{part: "z", op: "test", path: forceReplayPath(this.domain, this.id)}],
      } satisfies ForceMessage))
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
      this.#emit(impulse as ForceMessage)
    }
    socket.onclose = () => this.#reconnect()
    socket.onerror = () => this.#reconnect()
    return socket
  }

  override impulse(message: ForceMessage): void {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      this.#outbox.push(message)
      return
    }
    this.#socket.send(JSON.stringify(message))
  }

  #closeTransport(): void {
    this.#closed = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    this.#socket.close()
  }

  #emit(impulse: ForceMessage): void {
    this.#receiving = this.#receiving.then(() => this.onImpulse(impulse)).catch((error) => {
      console.error(`[${this.domain}] Force onImpulse failed`, error)
    })
  }

  async #destroy(): Promise<void> {
    this.#closeTransport()
    try {
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
