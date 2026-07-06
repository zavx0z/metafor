import type {ForceMessage} from "@metafor/types/force/message"

export class Force {
  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #observers = new Set<(impulse: ForceMessage) => void>()

  constructor(
    readonly force: {webSocket: string; domain: string; id: string},
  ) {
    this.#socket = this.#connect()
  }

  #connect(): WebSocket {
    const socket = new WebSocket(this.force.webSocket)
    socket.onopen = () => {
      this.impulse({type: "register", domain: this.force.domain, id: this.force.id})
      console.log(`[${this.force.domain}] connected to Force`)
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
      if (!this.#isForceMessage(impulse)) return
      this.#emit(impulse)
    }
    socket.onclose = () => this.#reconnect()
    socket.onerror = () => this.#reconnect()
    return socket
  }

  onImpulse(observer: (impulse: ForceMessage) => void): () => void {
    this.#observers.add(observer)
    return () => this.#observers.delete(observer)
  }

  impulse(message: unknown): void {
    this.#socket.send(JSON.stringify(message))
  }

  #emit(impulse: ForceMessage): void {
    for (const observer of this.#observers) observer(impulse)
  }

  #isForceMessage(value: unknown): value is ForceMessage {
    return typeof value === "object" && value !== null && Array.isArray((value as {parts?: unknown}).parts)
  }

  #reconnect(): void {
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined
      this.#socket = this.#connect()
    }, 500)
  }
}
