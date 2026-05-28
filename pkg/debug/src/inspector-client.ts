import {makeInspectorError, serializeError} from "./errors.ts"
import {asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {JsonObject} from "./types.ts"

type PendingRequest = {
  method: string
  timeout: ReturnType<typeof setTimeout>
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

type InspectorEventHandler = (method: string, params: JsonObject) => void

export type SocketState = "connecting" | "connected" | "disconnected"
export type SocketStateHandler = (state: SocketState, error?: string) => void

export type InspectorClientOptions = {
  url: string
  requestTimeoutMs: number
  logger: EventLogger
}

export class InspectorClient {
  #url: string

  #logger: EventLogger
  #requestTimeoutMs: number
  #socket: WebSocket | undefined
  #nextRequestId = 1
  #pendingRequests = new Map<number, PendingRequest>()
  #eventHandlers = new Set<InspectorEventHandler>()
  #stateHandlers = new Set<SocketStateHandler>()
  #socketState: SocketState = "disconnected"
  #lastError: string | undefined
  #textDecoder = new TextDecoder()

  constructor(options: InspectorClientOptions) {
    this.#url = options.url
    this.#requestTimeoutMs = options.requestTimeoutMs
    this.#logger = options.logger
  }

  get url(): string {
    return this.#url
  }

  setUrl(url: string): void {
    if (url === this.#url) return
    this.#logger.event("inspector.url.changed", {from: this.#url, to: url})
    this.#url = url
    // Force-close current socket — `maintainConnection` пойдёт по циклу с новым url.
    this.#socket?.close()
  }

  onEvent(handler: InspectorEventHandler): () => void {
    this.#eventHandlers.add(handler)
    return () => this.#eventHandlers.delete(handler)
  }

  onSocketStateChange(handler: SocketStateHandler): () => void {
    this.#stateHandlers.add(handler)
    handler(this.#socketState, this.#lastError)
    return () => this.#stateHandlers.delete(handler)
  }

  get socketState(): SocketState {
    return this.#socketState
  }

  get lastError(): string | undefined {
    return this.#lastError
  }

  #setSocketState(state: SocketState, error?: string): void {
    if (this.#socketState === state && this.#lastError === error) return
    this.#socketState = state
    this.#lastError = error
    for (const handler of this.#stateHandlers) {
      try {
        handler(state, error)
      } catch (handlerError) {
        this.#logger.event("socket.state_handler.failed", {error: serializeError(handlerError)})
      }
    }
  }

  connect(): Promise<WebSocket> {
    this.#setSocketState("connecting")
    return new Promise((resolve, reject) => {
      const nextSocket = new WebSocket(this.url)
      let settled = false

      this.#socket = nextSocket

      nextSocket.addEventListener("open", () => {
        settled = true
        this.#logger.status("interpreter socket connected")
        this.#logger.event("socket.open", {url: this.url})
        this.#setSocketState("connected")
        resolve(nextSocket)
      }, {once: true})

      nextSocket.addEventListener("message", (event) => {
        void this.#handleSocketMessage(event)
      })

      nextSocket.addEventListener("error", () => {
        this.#logger.event("socket.error", {url: this.url})
        if (!settled) {
          settled = true
          this.#setSocketState("disconnected", `failed to connect to ${this.url}`)
          reject(new Error(`failed to connect to ${this.url}`))
        }
      }, {once: true})

      nextSocket.addEventListener("close", (event) => {
        if (this.#socket === nextSocket) this.#socket = undefined
        this.rejectPendingRequests(new Error("inspector socket closed"))
        this.#logger.event("socket.close", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
        const reason = event.reason && event.reason.length > 0 ? event.reason : `code ${event.code}`
        this.#setSocketState("disconnected", `socket closed: ${reason}`)

        if (!settled) {
          settled = true
          reject(new Error(`connection closed before open: ${event.code}`))
        }
      }, {once: true})
    })
  }

  waitForClose(currentSocket: WebSocket): Promise<void> {
    return new Promise((resolve) => {
      if (currentSocket.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }

      currentSocket.addEventListener("close", () => {
        resolve()
      }, {once: true})
    })
  }

  request(method: string, params?: JsonObject): Promise<unknown> {
    const activeSocket = this.#socket
    if (activeSocket === undefined || activeSocket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`inspector socket is not open for ${method}`))
    }

    const id = this.#nextRequestId++
    const payload: {id: number; method: string; params?: JsonObject} = {id, method}
    if (params !== undefined) payload.params = params

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(id)
        reject(new Error(`${method} timed out after ${this.#requestTimeoutMs}ms`))
      }, this.#requestTimeoutMs)

      this.#pendingRequests.set(id, {method, timeout, resolve, reject})
      activeSocket.send(JSON.stringify(payload))
      this.#logger.event("inspector.request", {id, method})
    })
  }

  rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.#pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.#pendingRequests.delete(id)
    }
  }

  close(): void {
    this.rejectPendingRequests(new Error("inspector client closing"))
    this.#socket?.close()
  }

  async #handleSocketMessage(event: MessageEvent): Promise<void> {
    const text = await this.#messageText(event.data)
    if (text === undefined) {
      this.#logger.event("socket.message.unsupported", {dataType: typeof event.data})
      return
    }

    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      this.#handleProtocolMessage(trimmed)
    }
  }

  async #messageText(data: unknown): Promise<string | undefined> {
    if (typeof data === "string") return data
    if (data instanceof ArrayBuffer) return this.#textDecoder.decode(data)
    if (ArrayBuffer.isView(data)) return this.#textDecoder.decode(data)
    if (typeof Blob !== "undefined" && data instanceof Blob) return await data.text()
    return undefined
  }

  #handleProtocolMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      this.#logger.event("socket.message.invalid_json", {error: serializeError(error), raw})
      return
    }

    const message = asObject(parsed)
    if (message === undefined) {
      this.#logger.event("socket.message.invalid_shape", {raw})
      return
    }

    const id = asNumber(message["id"])
    if (id !== undefined) {
      this.#handleInspectorResponse(id, message)
      return
    }

    const method = asString(message["method"])
    if (method === undefined) {
      this.#logger.event("socket.message.unknown", {message})
      return
    }

    const params = asObject(message["params"]) ?? {}
    for (const handler of this.#eventHandlers) handler(method, params)
  }

  #handleInspectorResponse(id: number, message: JsonObject): void {
    const pending = this.#pendingRequests.get(id)
    if (pending === undefined) {
      this.#logger.event("inspector.response.unmatched", {id})
      return
    }

    this.#pendingRequests.delete(id)
    clearTimeout(pending.timeout)

    const error = message["error"]
    if (error !== undefined) {
      const inspectorError = makeInspectorError(pending.method, error)
      this.#logger.event("inspector.response.error", {
        id,
        method: pending.method,
        error: serializeError(inspectorError),
      })
      pending.reject(inspectorError)
      return
    }

    this.#logger.event("inspector.response.ok", {id, method: pending.method})
    pending.resolve(message["result"])
  }
}
