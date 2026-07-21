import {
  MONAD_RPC_VERSION,
  isMonadRpcCall,
  isMonadRpcResponse,
  isRoutedMonadRpcCall,
  monadRpcFailure,
  type MonadRpcCall,
  type MonadRpcMessage,
  type MonadRpcResponse,
  type RoutedMonadRpcCall,
} from "../../protocol/monad/rpc.ts"
import {
  MonadChannelEvents,
  MonadRpcRemoteError,
  normalizeMonadIdentity,
  type MonadChannel,
  type MonadChannelListener,
} from "./channel.ts"

export type MonadTransportOpenOptions = {
  methods?: readonly string[]
  endpoint?: string | URL
  waitMs?: number
  retryMs?: number
  requestTimeoutMs?: number
}

export type HttpMonadChannelOpening = {
  version: typeof MONAD_RPC_VERSION
  identity: string
  methods: string[]
  endpoint?: string
  callback?: string
}

export type HttpMonadChannelOpened = {
  version: typeof MONAD_RPC_VERSION
  channel: string
}

export type HttpMonadChannelSession = {
  readonly token: string
  readonly channel: MonadChannel
}

type PendingResponse = {
  resolve(response: MonadRpcResponse): void
  timer: ReturnType<typeof setTimeout>
}

type ServerChannel = MonadChannel & {
  receive(call: MonadRpcCall): Promise<MonadRpcResponse>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeMethods = (methods: readonly string[]): string[] => {
  const normalized = methods.map((method) => method.trim()).filter(Boolean)
  return [...new Set(normalized)].sort()
}

const responseStatus = (response: MonadRpcResponse): number => {
  if (response.ok) return 200
  if (response.error.code === "provider_unavailable") return 503
  if (response.error.code === "method_unavailable") return 404
  if (response.error.code === "invalid_request") return 400
  return 502
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const timeoutFailure = (id: string): MonadRpcResponse =>
  monadRpcFailure(id, "transport_error", "Monad RPC response timed out")

export const isLoopbackAddress = (address: string | undefined): boolean =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1"

export const readBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return null
  const token = authorization.slice("Bearer ".length).trim()
  return token.length > 0 ? token : null
}

export const readHttpMonadChannelOpening = (value: unknown): HttpMonadChannelOpening | null => {
  if (
    !isRecord(value) ||
    value.version !== MONAD_RPC_VERSION ||
    typeof value.identity !== "string" ||
    !Array.isArray(value.methods) ||
    !value.methods.every((method): method is string => typeof method === "string" && method.trim().length > 0)
  ) return null

  let identity: string
  try {
    identity = normalizeMonadIdentity(value.identity)
  } catch {
    return null
  }
  const methods = normalizeMethods(value.methods)
  if (methods.length === 0) return {version: MONAD_RPC_VERSION, identity, methods}
  if (typeof value.endpoint !== "string" || typeof value.callback !== "string" || !value.callback.trim()) return null

  let endpoint: URL
  try {
    endpoint = new URL(value.endpoint)
  } catch {
    return null
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null
  return {
    version: MONAD_RPC_VERSION,
    identity,
    methods,
    endpoint: endpoint.href,
    callback: value.callback.trim(),
  }
}

export const readHttpMonadChannel = (value: unknown): string | null => {
  if (!isRecord(value) || value.version !== MONAD_RPC_VERSION || typeof value.channel !== "string") return null
  const channel = value.channel.trim()
  return channel.length > 0 ? channel : null
}

class LocalMonadChannel implements MonadChannel {
  constructor(private readonly transport: BaseMonadTransport) {}

  get identity(): string {
    return this.transport.identity
  }

  get methods(): readonly string[] {
    return this.transport.methods
  }

  send(message: MonadRpcMessage): Promise<void> {
    return this.transport.send(message)
  }

  subscribe(listener: MonadChannelListener): () => void {
    return this.transport.subscribe(listener)
  }

  close(reason?: unknown): Promise<void> {
    return this.transport.close(reason)
  }
}

/** Current REST implementation that produces one transport-neutral MonadChannel. */
export class BaseMonadTransport {
  readonly channel: MonadChannel
  readonly identity: string
  readonly #base: URL
  readonly #events = new MonadChannelEvents()
  readonly #callback = crypto.randomUUID()
  readonly #incoming = new Map<string, PendingResponse>()
  #methods: string[] = []
  #token: string | null = null
  #opening: Promise<MonadChannel> | null = null
  #requestTimeoutMs = 10_000

  constructor(identity: string, address: string | URL) {
    this.identity = normalizeMonadIdentity(identity)
    this.#base = new URL(address)
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/"
    this.channel = new LocalMonadChannel(this)
  }

  get methods(): readonly string[] {
    return this.#methods
  }

  async open(options: MonadTransportOpenOptions = {}): Promise<MonadChannel> {
    if (this.#token) return this.channel
    if (this.#opening) return await this.#opening
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.#methods = normalizeMethods(options.methods ?? [])
    const endpoint = options.endpoint === undefined ? undefined : new URL(String(options.endpoint)).href
    if (this.#methods.length > 0 && endpoint === undefined) {
      throw new Error("Monad channel endpoint is required when methods are exposed")
    }

    this.#opening = this.#retry(async () => {
      const response = await fetch(new URL("monad/channels", this.#base), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          version: MONAD_RPC_VERSION,
          identity: this.identity,
          methods: this.#methods,
          ...(endpoint === undefined ? {} : {endpoint, callback: this.#callback}),
        }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      })
      if (!response.ok) throw new Error(`Force rejected Monad channel: HTTP ${response.status}`)
      const token = readHttpMonadChannel(await response.json())
      if (!token) throw new MonadRpcRemoteError("invalid_response", "Force returned an invalid Monad channel")
      this.#token = token
      return this.channel
    }, options)

    try {
      return await this.#opening
    } finally {
      this.#opening = null
    }
  }

  subscribe(listener: MonadChannelListener): () => void {
    return this.#events.subscribe(listener)
  }

  async send(message: MonadRpcMessage): Promise<void> {
    if (isMonadRpcResponse(message)) {
      const pending = this.#incoming.get(message.id)
      if (!pending) throw new Error(`Monad channel has no incoming call: ${message.id}`)
      this.#incoming.delete(message.id)
      clearTimeout(pending.timer)
      pending.resolve(message)
      return
    }
    if (isRoutedMonadRpcCall(message)) throw new Error("A domain MonadChannel cannot route its own RPC call")
    if (!isMonadRpcCall(message)) throw new Error("Invalid Monad RPC channel message")
    const token = this.#token
    if (!token) throw new Error(`Monad channel is not open: ${this.identity}`)

    const response = await fetch(new URL("monad/rpc", this.#base), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    })
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new MonadRpcRemoteError("invalid_response", `Force returned no RPC envelope: HTTP ${response.status}`)
    }
    if (!isMonadRpcResponse(value) || value.id !== message.id) {
      throw new MonadRpcRemoteError("invalid_response", "Force returned an invalid RPC response")
    }
    await this.#events.emit(value)
  }

  /** Receives a Force-to-Monad call at the domain server's REST endpoint. */
  async receive(request: Request): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${this.#callback}`) {
      return Response.json({ok: false, error: "Monad channel authorization is required"}, {status: 401})
    }
    let value: unknown
    try {
      value = await request.json()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json(monadRpcFailure("invalid", "invalid_request", message), {status: 400})
    }
    if (!isRoutedMonadRpcCall(value) || value.target !== this.identity) {
      return Response.json(monadRpcFailure("invalid", "invalid_request", "Invalid routed Monad RPC call"), {status: 400})
    }
    const response = await this.#receive(value)
    return Response.json(response, {status: responseStatus(response)})
  }

  async close(reason?: unknown): Promise<void> {
    const token = this.#token
    if (!token) return
    const response = await fetch(new URL("monad/channel", this.#base), {
      method: "DELETE",
      headers: {authorization: `Bearer ${token}`},
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Force rejected Monad channel close: HTTP ${response.status}`)
    }
    this.#token = null
    this.#closeIncoming(reason)
  }

  async #receive(call: RoutedMonadRpcCall): Promise<MonadRpcResponse> {
    if (this.#incoming.has(call.id)) return monadRpcFailure(call.id, "invalid_request", "Duplicate Monad RPC call id")
    const response = new Promise<MonadRpcResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.#incoming.delete(call.id)
        resolve(timeoutFailure(call.id))
      }, this.#requestTimeoutMs)
      this.#incoming.set(call.id, {resolve, timer})
    })
    try {
      await this.#events.emit(call)
    } catch (error) {
      const pending = this.#incoming.get(call.id)
      if (pending) {
        this.#incoming.delete(call.id)
        clearTimeout(pending.timer)
        pending.resolve(monadRpcFailure(call.id, "method_error", error instanceof Error ? error.message : String(error)))
      }
    }
    return await response
  }

  #closeIncoming(reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason ?? "Monad channel closed")
    for (const [id, pending] of this.#incoming) {
      clearTimeout(pending.timer)
      pending.resolve(monadRpcFailure(id, "transport_error", message))
    }
    this.#incoming.clear()
  }

  async #retry<T>(task: () => Promise<T>, options: MonadTransportOpenOptions): Promise<T> {
    const waitMs = options.waitMs ?? 0
    const deadline = Date.now() + waitMs
    while (true) {
      try {
        return await task()
      } catch (error) {
        if (error instanceof MonadRpcRemoteError || Date.now() >= deadline) throw error
        await wait(Math.max(1, options.retryMs ?? 50))
      }
    }
  }
}

class HttpServerMonadChannel implements ServerChannel {
  readonly identity: string
  readonly methods: readonly string[]
  readonly #endpoint: string | undefined
  readonly #callback: string | undefined
  readonly #events = new MonadChannelEvents()
  readonly #incoming = new Map<string, PendingResponse>()
  #closed = false

  constructor(opening: HttpMonadChannelOpening) {
    this.identity = opening.identity
    this.methods = opening.methods
    this.#endpoint = opening.endpoint
    this.#callback = opening.callback
  }

  subscribe(listener: MonadChannelListener): () => void {
    return this.#events.subscribe(listener)
  }

  async send(message: MonadRpcMessage): Promise<void> {
    if (this.#closed) throw new Error(`Monad channel is closed: ${this.identity}`)
    if (isMonadRpcResponse(message)) {
      const pending = this.#incoming.get(message.id)
      if (!pending) throw new Error(`Monad channel has no incoming call: ${message.id}`)
      this.#incoming.delete(message.id)
      clearTimeout(pending.timer)
      pending.resolve(message)
      return
    }
    if (!isRoutedMonadRpcCall(message)) throw new Error("MonadRouter must attach source before channel delivery")
    if (!this.#endpoint || !this.#callback) throw new Error(`Monad channel exposes no endpoint: ${this.identity}`)

    const response = await fetch(this.#endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#callback}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    })
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new MonadRpcRemoteError("invalid_response", `Monad ${this.identity} returned no RPC envelope`)
    }
    if (!isMonadRpcResponse(value) || value.id !== message.id) {
      throw new MonadRpcRemoteError("invalid_response", `Monad ${this.identity} returned an invalid RPC response`)
    }
    await this.#events.emit(value)
  }

  async receive(call: MonadRpcCall): Promise<MonadRpcResponse> {
    if (this.#closed) return monadRpcFailure(call.id, "transport_error", `Monad channel is closed: ${this.identity}`)
    if (this.#incoming.has(call.id)) return monadRpcFailure(call.id, "invalid_request", "Duplicate Monad RPC call id")
    const response = new Promise<MonadRpcResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.#incoming.delete(call.id)
        resolve(timeoutFailure(call.id))
      }, 10_000)
      this.#incoming.set(call.id, {resolve, timer})
    })
    try {
      await this.#events.emit(call)
    } catch (error) {
      const pending = this.#incoming.get(call.id)
      if (pending) {
        this.#incoming.delete(call.id)
        clearTimeout(pending.timer)
        pending.resolve(monadRpcFailure(call.id, "transport_error", error instanceof Error ? error.message : String(error)))
      }
    }
    return await response
  }

  async close(reason?: unknown): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    const message = reason instanceof Error ? reason.message : String(reason ?? "Monad channel closed")
    for (const [id, pending] of this.#incoming) {
      clearTimeout(pending.timer)
      pending.resolve(monadRpcFailure(id, "transport_error", message))
    }
    this.#incoming.clear()
    this.#events.clear()
  }
}

export type HttpMonadChannelRegistry = ReturnType<typeof createHttpMonadChannelRegistry>

/** Physical REST channel registry used by the Force server assembly. */
export const createHttpMonadChannelRegistry = (hooks: {
  opened(channel: MonadChannel): void
  closed(channel: MonadChannel): void
}) => {
  const sessions = new Map<string, {token: string; channel: ServerChannel}>()
  const identities = new Map<string, {token: string; channel: ServerChannel}>()

  const closeSession = async (session: {token: string; channel: ServerChannel}, reason?: unknown): Promise<void> => {
    if (sessions.get(session.token) !== session) return
    sessions.delete(session.token)
    if (identities.get(session.channel.identity) === session) identities.delete(session.channel.identity)
    hooks.closed(session.channel)
    await session.channel.close(reason)
  }

  return {
    async open(opening: HttpMonadChannelOpening): Promise<HttpMonadChannelSession> {
      const previous = identities.get(opening.identity)
      if (previous) await closeSession(previous, new Error("Monad channel was replaced"))
      const session = {
        token: crypto.randomUUID(),
        channel: new HttpServerMonadChannel(opening),
      }
      sessions.set(session.token, session)
      identities.set(opening.identity, session)
      hooks.opened(session.channel)
      return session
    },

    read(request: Request): HttpMonadChannelSession | null {
      const token = readBearerToken(request)
      return token ? sessions.get(token) ?? null : null
    },

    receive(session: HttpMonadChannelSession, value: unknown): Promise<MonadRpcResponse> {
      const current = sessions.get(session.token)
      if (current !== session || !isMonadRpcCall(value)) {
        return Promise.resolve(monadRpcFailure("invalid", "invalid_request", "Invalid Monad RPC call"))
      }
      const call: MonadRpcCall = {
        version: MONAD_RPC_VERSION,
        id: value.id,
        target: value.target,
        method: value.method,
        params: value.params,
      }
      return current.channel.receive(call)
    },

    async close(session: HttpMonadChannelSession, reason?: unknown): Promise<boolean> {
      if (sessions.get(session.token) !== session) return false
      await closeSession(session as {token: string; channel: ServerChannel}, reason)
      return true
    },

    async closeAll(reason?: unknown): Promise<void> {
      for (const session of [...sessions.values()]) await closeSession(session, reason)
    },
  }
}

export {MonadRpcRemoteError, normalizeMonadIdentity}
