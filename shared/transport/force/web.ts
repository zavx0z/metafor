import {sourceForceMessage, type ForceMessageInput, type SourcedForceMessage} from "../../protocol/force/message.ts"
import {logImpulse} from "./log.ts"
import {
  ForceBase,
  isForceControlMessage,
  type ForceControlMessage,
  type ForceTransportOptions,
} from "./base.ts"

export type {ForceControlMessage, ForceTransportOptions} from "./base.ts"

const forceBrowserAddress = (domain: string, id: string, parameters: Readonly<Record<string, string>>): string => {
  const address = new URL(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`)
  for (const [key, value] of Object.entries(parameters)) address.searchParams.set(key, value)
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
  #onControl: ((message: ForceControlMessage) => void | Promise<void>) | undefined
  #pendingControls: ForceControlMessage[] = []
  #receivingControls: Promise<void> = Promise.resolve()
  override onDestroy?: () => void | Promise<void>
  override readonly id: string

  constructor(override readonly domain: string, options: ForceTransportOptions = {}) {
    super()
    this.id = options.id?.trim() || `${domain}-web`
    this.#onControl = options.onControl
    if (Force.#instance) Force.#instance.#closeTransport()
    Force.#instance = this
    this.#socket = this.#connect(options.parameters ?? {})
  }

  #parameters: Readonly<Record<string, string>> = {}

  #connect(parameters: Readonly<Record<string, string>> = this.#parameters): WebSocket {
    this.#parameters = parameters
    const socket = new WebSocket(forceBrowserAddress(this.domain, this.id, parameters))
    socket.onopen = () => {
      this.emitConnection(true)
      console.log(`[${this.domain}] connected to Force`)
      while (this.#outbox.length > 0 && socket.readyState === WebSocket.OPEN) {
        const message = this.#outbox.shift()
        if (message) this.#send(socket, message)
      }
    }
    socket.onmessage = (event) => {
      let value: unknown
      try {
        value = JSON.parse(String(event.data)) as unknown
      } catch {
        return
      }
      if (isForceControlMessage(value)) {
        this.#emitControl(value)
        return
      }
      const impulse = value as SourcedForceMessage
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

  get onControl(): (message: ForceControlMessage) => void | Promise<void> {
    return this.#onControl ?? (() => {})
  }

  set onControl(handler: (message: ForceControlMessage) => void | Promise<void>) {
    this.#onControl = handler
    for (const message of this.#pendingControls.splice(0)) this.#enqueueControl(handler, message)
  }

  /** Sends one already-discriminated browser service-plane frame without queuing across reconnects. */
  sendControl(message: ForceControlMessage): boolean {
    if (!isForceControlMessage(message) || this.#socket.readyState !== WebSocket.OPEN) return false
    this.#socket.send(JSON.stringify(message))
    return true
  }

  #send(socket: WebSocket, message: SourcedForceMessage): void {
    logImpulse(this.domain, "->", message)
    socket.send(JSON.stringify(message))
  }

  #emitControl(message: ForceControlMessage): void {
    const handler = this.#onControl
    if (!handler) {
      this.#pendingControls.push(message)
      return
    }
    this.#enqueueControl(handler, message)
  }

  #enqueueControl(
    handler: (message: ForceControlMessage) => void | Promise<void>,
    message: ForceControlMessage,
  ): void {
    this.#receivingControls = this.#receivingControls.then(() => handler(message)).catch((error) => {
      console.error(`[${this.domain}] Force control handler failed`, error)
    })
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
