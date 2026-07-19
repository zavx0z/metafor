import {sourceForceMessage, type ForceMessageInput, type SourcedForceMessage} from "@metafor/types/force/message"
import {forceReplayPath} from "@metafor/types/force/replay"
import {logImpulse} from "../src/log"
import {ForceBase} from "./base"

const forceBrowserAddress = (domain: string, id: string): string => {
  const address = new URL(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`)
  address.searchParams.set("domain", domain)
  address.searchParams.set("id", id)
  return address.href
}

export class Force extends ForceBase {
  static #instance: Force | undefined

  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #closed = false
  #outbox: SourcedForceMessage[] = []
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
    const socket = new WebSocket(forceBrowserAddress(this.domain, this.id))
    socket.onopen = () => {
      this.emitConnection(true)
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        const message = this.#outbox.shift()
        if (message) this.#send(socket, message)
      }
      this.#send(socket, sourceForceMessage({
        parts: [{part: "z", op: "test", path: forceReplayPath(this.domain, this.id), ts: Date.now()}],
      }, this.domain))
    }
    socket.onmessage = (event) => {
      let impulse: SourcedForceMessage
      try {
        impulse = JSON.parse(String(event.data)) as SourcedForceMessage
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
    socket.onerror = () => socket.close()
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
