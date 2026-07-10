import type {ForceMessage} from "@metafor/types/force/message"
import {ForceBase} from "../core/base"

const FORCE_BROWSER_ADDRESS = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`

export class Force extends ForceBase {
  static #instance: Force | undefined

  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #receiving: Promise<void> = Promise.resolve()
  #closed = false
  #outbox: unknown[] = []
  override onCreate: (snapshot: any) => void | Promise<void> = () => {}
  override onImpulse: (impulse: ForceMessage) => void | Promise<void> = () => {}
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
      this.impulse({type: "register", domain: this.domain, id: this.id})
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(this.#outbox.shift()))
      }
    }
    socket.onmessage = (event) => {
      let impulse: unknown
      try {
        impulse = JSON.parse(String(event.data)) as unknown
      } catch {
        return
      }
      if (typeof impulse === "object" && impulse !== null && (impulse as {type?: unknown}).type === "create") {
        this.#create((impulse as {snapshot: unknown}).snapshot)
        return
      }
      if (
        typeof impulse !== "object" ||
        impulse === null ||
        (impulse as {type?: unknown}).type !== undefined ||
        !Array.isArray((impulse as {parts?: unknown}).parts)
      ) return
      this.#emit(impulse as ForceMessage)
    }
    socket.onclose = () => {
      if (this.#closed) return
      void this.#destroy().finally(() => this.#reconnect())
    }
    socket.onerror = () => socket.close()
    return socket
  }

  override impulse(message: unknown): void {
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

  #create(snapshot: unknown): void {
    this.#receiving = this.#receiving.then(() => this.onCreate(snapshot)).catch((error) => {
      console.error(`[${this.domain}] Force onCreate failed`, error)
    })
  }

  #emit(impulse: ForceMessage): void {
    this.#receiving = this.#receiving.then(() => this.onImpulse(impulse)).catch((error) => {
      console.error(`[${this.domain}] Force onImpulse failed`, error)
    })
  }

  async #destroy(): Promise<void> {
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
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      Force.#instance = this
      this.#socket = this.#connect()
    }, 500)
  }
}
