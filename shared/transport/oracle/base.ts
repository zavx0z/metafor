import {
  ORACLE_RPC_VERSION,
  isOracleRpcCall,
  isOracleRpcResponse,
  isRoutedOracleRpcCall,
  oracleRpcFailure,
  type OracleRpcCall,
  type OracleRpcMessage,
  type OracleRpcResponse,
  type RoutedOracleRpcCall,
} from "../../protocol/oracle/rpc.ts"
import {
  OracleChannelEvents,
  OracleRpcRemoteError,
  normalizeOracleIdentity,
  type OracleChannel,
  type OracleChannelListener,
} from "./channel.ts"

export type OracleTransportOpenOptions = {
  methods?: readonly string[]
  endpoint?: string | URL
  waitMs?: number
  retryMs?: number
  requestTimeoutMs?: number
}

export type HttpOracleChannelOpening = {
  version: typeof ORACLE_RPC_VERSION
  identity: string
  methods: string[]
  endpoint?: string
  callback?: string
}

export type HttpOracleChannelOpened = {
  version: typeof ORACLE_RPC_VERSION
  channel: string
}

export type HttpOracleChannelSession = {
  readonly token: string
  readonly channel: OracleChannel
}

type PendingResponse = {
  resolve(response: OracleRpcResponse): void
  timer: ReturnType<typeof setTimeout>
}

type ServerChannel = OracleChannel & {
  receive(call: OracleRpcCall): Promise<OracleRpcResponse>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeMethods = (methods: readonly string[]): string[] => {
  const normalized = methods.map((method) => method.trim()).filter(Boolean)
  return [...new Set(normalized)].sort()
}

const responseStatus = (response: OracleRpcResponse): number => {
  if (response.ok) return 200
  if (response.error.code === "provider_unavailable") return 503
  if (response.error.code === "method_unavailable") return 404
  if (response.error.code === "invalid_request") return 400
  return 502
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const timeoutFailure = (id: string): OracleRpcResponse =>
  oracleRpcFailure(id, "transport_error", "Oracle RPC response timed out")

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

export const readHttpOracleChannelOpening = (value: unknown): HttpOracleChannelOpening | null => {
  if (
    !isRecord(value) ||
    value.version !== ORACLE_RPC_VERSION ||
    typeof value.identity !== "string" ||
    !Array.isArray(value.methods) ||
    !value.methods.every((method): method is string => typeof method === "string" && method.trim().length > 0)
  ) return null

  let identity: string
  try {
    identity = normalizeOracleIdentity(value.identity)
  } catch {
    return null
  }
  const methods = normalizeMethods(value.methods)
  if (methods.length === 0) return {version: ORACLE_RPC_VERSION, identity, methods}
  if (typeof value.endpoint !== "string" || typeof value.callback !== "string" || !value.callback.trim()) return null

  let endpoint: URL
  try {
    endpoint = new URL(value.endpoint)
  } catch {
    return null
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null
  return {
    version: ORACLE_RPC_VERSION,
    identity,
    methods,
    endpoint: endpoint.href,
    callback: value.callback.trim(),
  }
}

export const readHttpOracleChannel = (value: unknown): string | null => {
  if (!isRecord(value) || value.version !== ORACLE_RPC_VERSION || typeof value.channel !== "string") return null
  const channel = value.channel.trim()
  return channel.length > 0 ? channel : null
}

class LocalOracleChannel implements OracleChannel {
  constructor(private readonly transport: BaseOracleTransport) {}

  get identity(): string {
    return this.transport.identity
  }

  get methods(): readonly string[] {
    return this.transport.methods
  }

  send(message: OracleRpcMessage): Promise<void> {
    return this.transport.send(message)
  }

  subscribe(listener: OracleChannelListener): () => void {
    return this.transport.subscribe(listener)
  }

  close(reason?: unknown): Promise<void> {
    return this.transport.close(reason)
  }
}

/** Current REST implementation that produces one transport-neutral OracleChannel. */
export class BaseOracleTransport {
  readonly channel: OracleChannel
  readonly identity: string
  readonly #base: URL
  readonly #events = new OracleChannelEvents()
  readonly #callback = crypto.randomUUID()
  readonly #incoming = new Map<string, PendingResponse>()
  #methods: string[] = []
  #token: string | null = null
  #opening: Promise<OracleChannel> | null = null
  #requestTimeoutMs = 10_000

  constructor(identity: string, address: string | URL) {
    this.identity = normalizeOracleIdentity(identity)
    this.#base = new URL(address)
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/"
    this.channel = new LocalOracleChannel(this)
  }

  get methods(): readonly string[] {
    return this.#methods
  }

  async open(options: OracleTransportOpenOptions = {}): Promise<OracleChannel> {
    if (this.#token) return this.channel
    if (this.#opening) return await this.#opening
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.#methods = normalizeMethods(options.methods ?? [])
    const endpoint = options.endpoint === undefined ? undefined : new URL(String(options.endpoint)).href
    if (this.#methods.length > 0 && endpoint === undefined) {
      throw new Error("Oracle channel endpoint is required when methods are exposed")
    }

    this.#opening = this.#retry(async () => {
      const response = await fetch(new URL("oracle/channels", this.#base), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          version: ORACLE_RPC_VERSION,
          identity: this.identity,
          methods: this.#methods,
          ...(endpoint === undefined ? {} : {endpoint, callback: this.#callback}),
        }),
        signal: AbortSignal.timeout(this.#requestTimeoutMs),
      })
      if (!response.ok) throw new Error(`Dark rejected Oracle channel: HTTP ${response.status}`)
      const token = readHttpOracleChannel(await response.json())
      if (!token) throw new OracleRpcRemoteError("invalid_response", "Dark returned an invalid Oracle channel")
      this.#token = token
      return this.channel
    }, options)

    try {
      return await this.#opening
    } finally {
      this.#opening = null
    }
  }

  subscribe(listener: OracleChannelListener): () => void {
    return this.#events.subscribe(listener)
  }

  async send(message: OracleRpcMessage): Promise<void> {
    if (isOracleRpcResponse(message)) {
      const pending = this.#incoming.get(message.id)
      if (!pending) throw new Error(`Oracle channel has no incoming call: ${message.id}`)
      this.#incoming.delete(message.id)
      clearTimeout(pending.timer)
      pending.resolve(message)
      return
    }
    if (isRoutedOracleRpcCall(message)) throw new Error("A domain OracleChannel cannot route its own RPC call")
    if (!isOracleRpcCall(message)) throw new Error("Invalid Oracle RPC channel message")
    const token = this.#token
    if (!token) throw new Error(`Oracle channel is not open: ${this.identity}`)

    const response = await fetch(new URL("oracle/rpc", this.#base), {
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
      throw new OracleRpcRemoteError("invalid_response", `Dark returned no Oracle RPC envelope: HTTP ${response.status}`)
    }
    if (!isOracleRpcResponse(value) || value.id !== message.id) {
      throw new OracleRpcRemoteError("invalid_response", "Dark returned an invalid Oracle RPC response")
    }
    await this.#events.emit(value)
  }

  /** Receives a Dark-Oracle-to-domain call at the domain server's REST endpoint. */
  async receive(request: Request): Promise<Response> {
    if (request.headers.get("authorization") !== `Bearer ${this.#callback}`) {
      return Response.json({ok: false, error: "Oracle channel authorization is required"}, {status: 401})
    }
    let value: unknown
    try {
      value = await request.json()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json(oracleRpcFailure("invalid", "invalid_request", message), {status: 400})
    }
    if (!isRoutedOracleRpcCall(value) || value.target !== this.identity) {
      return Response.json(oracleRpcFailure("invalid", "invalid_request", "Invalid routed Oracle RPC call"), {status: 400})
    }
    const response = await this.#receive(value)
    return Response.json(response, {status: responseStatus(response)})
  }

  async close(reason?: unknown): Promise<void> {
    const token = this.#token
    if (!token) return
    const response = await fetch(new URL("oracle/channel", this.#base), {
      method: "DELETE",
      headers: {authorization: `Bearer ${token}`},
      signal: AbortSignal.timeout(this.#requestTimeoutMs),
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Dark rejected Oracle channel close: HTTP ${response.status}`)
    }
    this.#token = null
    this.#closeIncoming(reason)
  }

  async #receive(call: RoutedOracleRpcCall): Promise<OracleRpcResponse> {
    if (this.#incoming.has(call.id)) return oracleRpcFailure(call.id, "invalid_request", "Duplicate Oracle RPC call id")
    const response = new Promise<OracleRpcResponse>((resolve) => {
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
        pending.resolve(oracleRpcFailure(call.id, "method_error", error instanceof Error ? error.message : String(error)))
      }
    }
    return await response
  }

  #closeIncoming(reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason ?? "Oracle channel closed")
    for (const [id, pending] of this.#incoming) {
      clearTimeout(pending.timer)
      pending.resolve(oracleRpcFailure(id, "transport_error", message))
    }
    this.#incoming.clear()
  }

  async #retry<T>(task: () => Promise<T>, options: OracleTransportOpenOptions): Promise<T> {
    const waitMs = options.waitMs ?? 0
    const deadline = Date.now() + waitMs
    while (true) {
      try {
        return await task()
      } catch (error) {
        if (error instanceof OracleRpcRemoteError || Date.now() >= deadline) throw error
        await wait(Math.max(1, options.retryMs ?? 50))
      }
    }
  }
}

class HttpServerOracleChannel implements ServerChannel {
  readonly identity: string
  readonly methods: readonly string[]
  readonly #endpoint: string | undefined
  readonly #callback: string | undefined
  readonly #events = new OracleChannelEvents()
  readonly #incoming = new Map<string, PendingResponse>()
  #closed = false

  constructor(opening: HttpOracleChannelOpening) {
    this.identity = opening.identity
    this.methods = opening.methods
    this.#endpoint = opening.endpoint
    this.#callback = opening.callback
  }

  subscribe(listener: OracleChannelListener): () => void {
    return this.#events.subscribe(listener)
  }

  async send(message: OracleRpcMessage): Promise<void> {
    if (this.#closed) throw new Error(`Oracle channel is closed: ${this.identity}`)
    if (isOracleRpcResponse(message)) {
      const pending = this.#incoming.get(message.id)
      if (!pending) throw new Error(`Oracle channel has no incoming call: ${message.id}`)
      this.#incoming.delete(message.id)
      clearTimeout(pending.timer)
      pending.resolve(message)
      return
    }
    if (!isRoutedOracleRpcCall(message)) throw new Error("OracleRouter must attach source before channel delivery")
    if (!this.#endpoint || !this.#callback) throw new Error(`Oracle channel exposes no endpoint: ${this.identity}`)

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
      throw new OracleRpcRemoteError("invalid_response", `Oracle ${this.identity} returned no RPC envelope`)
    }
    if (!isOracleRpcResponse(value) || value.id !== message.id) {
      throw new OracleRpcRemoteError("invalid_response", `Oracle ${this.identity} returned an invalid RPC response`)
    }
    await this.#events.emit(value)
  }

  async receive(call: OracleRpcCall): Promise<OracleRpcResponse> {
    if (this.#closed) return oracleRpcFailure(call.id, "transport_error", `Oracle channel is closed: ${this.identity}`)
    if (this.#incoming.has(call.id)) return oracleRpcFailure(call.id, "invalid_request", "Duplicate Oracle RPC call id")
    const response = new Promise<OracleRpcResponse>((resolve) => {
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
        pending.resolve(oracleRpcFailure(call.id, "transport_error", error instanceof Error ? error.message : String(error)))
      }
    }
    return await response
  }

  async close(reason?: unknown): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    const message = reason instanceof Error ? reason.message : String(reason ?? "Oracle channel closed")
    for (const [id, pending] of this.#incoming) {
      clearTimeout(pending.timer)
      pending.resolve(oracleRpcFailure(id, "transport_error", message))
    }
    this.#incoming.clear()
    this.#events.clear()
  }
}

export type HttpOracleChannelRegistry = ReturnType<typeof createHttpOracleChannelRegistry>

/** Physical REST channel registry used by the Dark server assembly. */
export const createHttpOracleChannelRegistry = (hooks: {
  opened(channel: OracleChannel): void
  closed(channel: OracleChannel): void
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
    async open(opening: HttpOracleChannelOpening): Promise<HttpOracleChannelSession> {
      const previous = identities.get(opening.identity)
      if (previous) await closeSession(previous, new Error("Oracle channel was replaced"))
      const session = {
        token: crypto.randomUUID(),
        channel: new HttpServerOracleChannel(opening),
      }
      sessions.set(session.token, session)
      identities.set(opening.identity, session)
      hooks.opened(session.channel)
      return session
    },

    read(request: Request): HttpOracleChannelSession | null {
      const token = readBearerToken(request)
      return token ? sessions.get(token) ?? null : null
    },

    receive(session: HttpOracleChannelSession, value: unknown): Promise<OracleRpcResponse> {
      const current = sessions.get(session.token)
      if (current !== session || !isOracleRpcCall(value)) {
        return Promise.resolve(oracleRpcFailure("invalid", "invalid_request", "Invalid Oracle RPC call"))
      }
      const call: OracleRpcCall = {
        version: ORACLE_RPC_VERSION,
        id: value.id,
        target: value.target,
        method: value.method,
        params: value.params,
      }
      return current.channel.receive(call)
    },

    async close(session: HttpOracleChannelSession, reason?: unknown): Promise<boolean> {
      if (sessions.get(session.token) !== session) return false
      await closeSession(session as {token: string; channel: ServerChannel}, reason)
      return true
    },

    async closeAll(reason?: unknown): Promise<void> {
      for (const session of [...sessions.values()]) await closeSession(session, reason)
    },
  }
}

export {OracleRpcRemoteError, normalizeOracleIdentity}
