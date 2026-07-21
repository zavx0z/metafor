import {sourceForceMessage, type ForceMessageInput, type SourcedForceMessage} from "../../protocol/force/message.ts"
import {logImpulse} from "./log.ts"
import {ForceBase, type ForceTransportOptions} from "./base.ts"

export type {ForceTransportOptions} from "./base.ts"

const FORCE_DEFAULT_ADDRESS = "ws://127.0.0.1:4000/ws"

export class Force extends ForceBase {
  static #instance: Force | undefined
  static #hooksInstalled = false
  static #shutdown: Promise<void> | undefined

  #address: string
  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #closed = false
  #outbox: SourcedForceMessage[] = []
  override onDestroy?: () => void | Promise<void>
  override readonly id: string

  constructor(override readonly domain: string, options: ForceTransportOptions = {}) {
    super()
    this.id = options.id?.trim() || `${domain}-local`
    const address = new URL(Bun.env.FORCE_ADDRESS?.trim() || FORCE_DEFAULT_ADDRESS)
    for (const [key, value] of Object.entries(options.parameters ?? {})) address.searchParams.set(key, value)
    address.searchParams.set("domain", domain)
    address.searchParams.set("id", this.id)
    this.#address = address.href
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
      this.emitConnection(true)
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        const message = this.#outbox.shift()
        if (message) this.#send(socket, message)
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
      let impulse: SourcedForceMessage
      try {
        impulse = JSON.parse(text) as SourcedForceMessage
      } catch {
        return
      }
      logImpulse(this.domain, "<-", impulse)
      this.emitImpulse(impulse)
    }
    socket.onclose = () => {
      this.emitConnection(false)
      this.#reconnect()
    }
    socket.onerror = () => this.#reconnect()
    return socket
  }

  override impulse(input: ForceMessageInput): void {
    const message = sourceForceMessage(input, this.domain)
    if (this.#socket.readyState !== WebSocket.OPEN) {
      this.#outbox.push(message)
      return
    }
    this.#send(this.#socket, message)
  }

  #send(socket: WebSocket, message: SourcedForceMessage): void {
    logImpulse(this.domain, "->", message)
    socket.send(JSON.stringify(message))
  }

  #closeTransport(): void {
    this.#closed = true
    this.emitConnection(false)
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    this.#socket.close()
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
