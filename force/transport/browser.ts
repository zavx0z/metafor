import type {ForceMessage} from "@metafor/types/force/message"
import {forceReplayPath} from "@metafor/types/force/replay"
import {ForceBase} from "../core/base"
import {logImpulse} from "../core/log"

const FORCE_BROWSER_ADDRESS = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`

export class Force extends ForceBase {
  static #instance: Force | undefined

  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #closed = false
  #outbox: ForceMessage[] = []
  override onDestroy?: () => void | Promise<void>
  override readonly id: string

  constructor(override readonly domain: string) {
    super()
    this.id = `${domain}-web`
    if (Force.#instance) Force.#instance.#closeTransport()
    Force.#instance = this
    this.#socket = this.#connect()
  }

  #connect(): WebSocket {
    const socket = new WebSocket(FORCE_BROWSER_ADDRESS)
    socket.onopen = () => {
      socket.send(JSON.stringify({type: "register", domain: this.domain, id: this.id}))
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        const message = this.#outbox.shift()
        if (message) this.#send(socket, message)
      }
      this.#send(socket, {
        parts: [{part: "z", op: "test", path: forceReplayPath(this.domain, this.id)}],
      } satisfies ForceMessage)
    }
    socket.onmessage = (event) => {
      let impulse: unknown
      try {
        impulse = JSON.parse(String(event.data)) as unknown
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
      logImpulse(this.domain, "<-", message)
      this.emitImpulse(message)
    }
    socket.onclose = () => this.#reconnect()
    socket.onerror = () => socket.close()
    return socket
  }

  override impulse(message: ForceMessage): void {
    if (this.#socket.readyState !== WebSocket.OPEN) {
      this.#outbox.push(message)
      return
    }
    this.#send(this.#socket, message)
  }

  #send(socket: WebSocket, message: ForceMessage): void {
    logImpulse(this.domain, "->", message)
    socket.send(JSON.stringify(message))
  }

  #closeTransport(): void {
    this.#closed = true
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = undefined
    }
    this.#socket.close()
  }

  #reconnect(): void {
    if (this.#closed) return
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      Force.#instance = this
      this.#socket = this.#connect()
    }, 500)
  }
}
