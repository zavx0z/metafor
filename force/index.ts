import type {ForceMessage} from "@metafor/types/force/message"

const FORCE_DEFAULT_ADDRESS = "ws://127.0.0.1:4000/ws"

/**
 * Доменный Force-транспорт.
 *
 * Один процесс домена создает один `Force`: он подключается к центральному
 * Force WebSocket, регистрируется как `<domain>-local`, отправляет наружу
 * импульсы через `impulse()` и принимает входящие ForceMessage через
 * назначенный `onImpulse`.
 *
 * `onCreate` вызывается один раз на служебный create-снимок перед обычными
 * импульсами, чтобы доменный runtime сначала восстановил состояние.
 * `onDestroy` вызывается только при завершении процесса и нужен для cleanup
 * ресурсов домена, например базы данных.
 *
 * Force не применяет патчи, не хранит состояние домена и не открывает наружу
 * ручной close/destroy: жизненный цикл транспорта принадлежит процессу.
 */
export class Force {
  static #instance: Force | undefined
  static #hooksInstalled = false
  static #shutdown: Promise<void> | undefined

  #address: string
  #socket: WebSocket
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined
  #creating: Promise<void> | undefined
  #created = false
  #closed = false
  #outbox: unknown[] = []
  onCreate: (snapshot: any) => void | Promise<void> = () => {}
  onImpulse: (impulse: ForceMessage) => void | Promise<void> = () => {}
  onDestroy?: () => void | Promise<void>
  readonly id: string

  constructor(readonly domain: string) {
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
      this.impulse({type: "register", domain: this.domain, id: this.id})
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(this.#outbox.shift()))
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
      if (typeof impulse === "object" && impulse !== null && (impulse as {type?: unknown}).type === "create") {
        this.#create((impulse as {snapshot: unknown}).snapshot)
        return
      }
      if (typeof impulse !== "object" || impulse === null || !Array.isArray((impulse as {parts?: unknown}).parts)) return
      this.#emit(impulse as ForceMessage)
    }
    socket.onclose = () => this.#reconnect()
    socket.onerror = () => this.#reconnect()
    return socket
  }

  impulse(message: unknown): void {
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
    if (this.#created) return
    this.#created = true
    try {
      this.#creating = Promise.resolve(this.onCreate(snapshot)).catch((error) => {
        console.error(`[${this.domain}] Force onCreate failed`, error)
      }).finally(() => {
        this.#creating = undefined
      })
      void this.#creating
    } catch (error) {
      console.error(`[${this.domain}] Force onCreate failed`, error)
    }
  }

  async #emit(impulse: ForceMessage): Promise<void> {
    try {
      if (this.#creating) await this.#creating
      await Promise.resolve(this.onImpulse(impulse)).catch((error) => {
        console.error(`[${this.domain}] Force onImpulse failed`, error)
      })
    } catch (error) {
      console.error(`[${this.domain}] Force onImpulse failed`, error)
    }
  }

  async #destroy(): Promise<void> {
    this.#closeTransport()
    try {
      if (this.onDestroy) await this.onDestroy()
    } catch (error) {
      console.error(`[${this.domain}] Force onDestroy failed`, error)
    } finally {
      if (Force.#instance === this) {
        Force.#instance = undefined
      }
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
