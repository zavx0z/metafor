import type {ServerWebSocket} from "bun"
import {
  ORACLE_RPC_VERSION,
  isOracleRpcCall,
  isOracleRpcResponse,
  isRoutedOracleRpcCall,
  type OracleRpcMessage,
} from "../../protocol/oracle/rpc.ts"
import {
  OracleChannelEvents,
  normalizeOracleIdentity,
  type OracleChannel,
  type OracleChannelListener,
} from "./channel.ts"
import type {OracleTransportOpenOptions} from "./base.ts"

export const ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES = 32 * 1_024 * 1_024
export const ORACLE_WEBSOCKET_PATH = "/oracle/ws"

export type OracleWebSocketData = {
  kind: "oracle"
  identity: string
  id: string
}

type OracleWebSocketOpening = {
  kind: "oracle.open"
  version: typeof ORACLE_RPC_VERSION
  identity: string
  methods: string[]
}

type OracleWebSocketOpened = {
  kind: "oracle.opened"
  version: typeof ORACLE_RPC_VERSION
  identity: string
}

type OracleServerSocket = ServerWebSocket<OracleWebSocketData>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const normalizeMethods = (methods: readonly string[]): string[] => {
  const normalized = methods.map((method) => method.trim()).filter(Boolean)
  return [...new Set(normalized)].sort()
}

const jsonBytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength

const parseMessage = (raw: string | Buffer): unknown => {
  const text = String(raw)
  if (jsonBytes(text) > ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES) {
    throw new Error("Oracle WebSocket payload exceeds limit")
  }
  return JSON.parse(text) as unknown
}

const readOpening = (
  value: unknown,
  identity: string,
): OracleWebSocketOpening | null => {
  if (
    !isRecord(value) ||
    value.kind !== "oracle.open" ||
    value.version !== ORACLE_RPC_VERSION ||
    value.identity !== identity ||
    !Array.isArray(value.methods) ||
    !value.methods.every((method): method is string =>
      typeof method === "string" && method.trim().length > 0)
  ) return null
  return {
    kind: "oracle.open",
    version: ORACLE_RPC_VERSION,
    identity,
    methods: normalizeMethods(value.methods),
  }
}

const isOpened = (
  value: unknown,
  identity: string,
): value is OracleWebSocketOpened =>
  isRecord(value) &&
  value.kind === "oracle.opened" &&
  value.version === ORACLE_RPC_VERSION &&
  value.identity === identity

const isRpcMessage = (value: unknown): value is OracleRpcMessage =>
  isOracleRpcCall(value) ||
  isRoutedOracleRpcCall(value) ||
  isOracleRpcResponse(value)

export const readOracleWebSocketData = (
  request: Request,
): OracleWebSocketData | null => {
  const url = new URL(request.url)
  const rawIdentity = url.searchParams.get("identity")
  const id = url.searchParams.get("id")
  if (!rawIdentity || !id || id.length > 256) return null
  try {
    return {
      kind: "oracle",
      identity: normalizeOracleIdentity(rawIdentity),
      id,
    }
  } catch {
    return null
  }
}

class ServerOracleWebSocketChannel implements OracleChannel {
  readonly #events = new OracleChannelEvents()
  #closed = false

  constructor(
    private readonly socket: OracleServerSocket,
    readonly identity: string,
    readonly methods: readonly string[],
  ) {}

  subscribe(listener: OracleChannelListener): () => void {
    return this.#events.subscribe(listener)
  }

  async send(message: OracleRpcMessage): Promise<void> {
    if (this.#closed || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Oracle WebSocket is closed: ${this.identity}`)
    }
    const payload = JSON.stringify(message)
    if (jsonBytes(payload) > ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES) {
      throw new Error("Oracle WebSocket payload exceeds limit")
    }
    this.socket.send(payload)
  }

  async receive(message: OracleRpcMessage): Promise<void> {
    if (this.#closed) return
    await this.#events.emit(message)
  }

  async close(_reason?: unknown): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#events.clear()
  }
}

export type OracleWebSocketChannelRegistry = ReturnType<
  typeof createOracleWebSocketChannelRegistry
>

/** Dark-side registry for permanent duplex Oracle WebSocket channels. */
export const createOracleWebSocketChannelRegistry = (hooks: {
  opened(channel: OracleChannel): void
  closed(channel: OracleChannel): void
}) => {
  type Session = {
    socket: OracleServerSocket
    channel: ServerOracleWebSocketChannel
  }

  const sessions = new Map<OracleServerSocket, Session>()
  const identities = new Map<string, Session>()

  const closeSession = async (
    session: Session,
    reason?: unknown,
  ): Promise<void> => {
    if (sessions.get(session.socket) !== session) return
    sessions.delete(session.socket)
    if (identities.get(session.channel.identity) === session) {
      identities.delete(session.channel.identity)
    }
    hooks.closed(session.channel)
    await session.channel.close(reason)
  }

  return {
    async receive(socket: OracleServerSocket, raw: string | Buffer): Promise<void> {
      const value = parseMessage(raw)
      const existing = sessions.get(socket)
      if (existing) {
        if (!isRpcMessage(value)) throw new Error("Invalid Oracle RPC WebSocket message")
        await existing.channel.receive(value)
        return
      }

      const opening = readOpening(value, socket.data.identity)
      if (!opening) throw new Error("Invalid Oracle WebSocket opening")

      const previous = identities.get(opening.identity)
      if (previous) {
        await closeSession(previous, new Error("Oracle channel was replaced"))
        previous.socket.close(1012, "Oracle channel replaced")
      }

      const session: Session = {
        socket,
        channel: new ServerOracleWebSocketChannel(
          socket,
          opening.identity,
          opening.methods,
        ),
      }
      sessions.set(socket, session)
      identities.set(opening.identity, session)
      hooks.opened(session.channel)
      socket.send(JSON.stringify({
        kind: "oracle.opened",
        version: ORACLE_RPC_VERSION,
        identity: opening.identity,
      } satisfies OracleWebSocketOpened))
    },

    async closed(socket: OracleServerSocket, reason?: unknown): Promise<boolean> {
      const session = sessions.get(socket)
      if (!session) return false
      await closeSession(session, reason)
      return true
    },

    async closeAll(reason?: unknown): Promise<void> {
      for (const session of [...sessions.values()]) {
        await closeSession(session, reason)
        session.socket.close(1012, "Dark server stopped")
      }
    },
  }
}

class ClientOracleChannel implements OracleChannel {
  constructor(private readonly transport: OracleWebSocketTransport) {}

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

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

/** Domain-side permanent duplex Oracle WebSocket adapter. */
export class OracleWebSocketTransport {
  readonly channel: OracleChannel
  readonly identity: string
  readonly #address: URL
  readonly #events = new OracleChannelEvents()
  readonly #id: string
  #methods: string[] = []
  #socket: WebSocket | null = null
  #opening: Promise<OracleChannel> | null = null
  #opened = false
  #closed = false

  constructor(identity: string, address: string | URL) {
    this.identity = normalizeOracleIdentity(identity)
    this.#address = new URL(address)
    this.#id = `${this.identity}-${crypto.randomUUID()}`
    this.channel = new ClientOracleChannel(this)
  }

  get methods(): readonly string[] {
    return this.#methods
  }

  async open(options: OracleTransportOpenOptions = {}): Promise<OracleChannel> {
    if (this.#opened) return this.channel
    if (this.#opening) return await this.#opening
    if (options.endpoint !== undefined) {
      throw new Error("Oracle WebSocket transport does not use a callback endpoint")
    }
    this.#methods = normalizeMethods(options.methods ?? [])
    this.#closed = false
    this.#opening = this.#retryOpen(options)
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
    if (!isRpcMessage(message)) throw new Error("Invalid Oracle RPC WebSocket message")
    const socket = this.#socket
    if (!this.#opened || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Oracle WebSocket is not open: ${this.identity}`)
    }
    const payload = JSON.stringify(message)
    if (jsonBytes(payload) > ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES) {
      throw new Error("Oracle WebSocket payload exceeds limit")
    }
    while (
      socket.readyState === WebSocket.OPEN &&
      socket.bufferedAmount > ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES
    ) {
      await sleep(1)
    }
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Oracle WebSocket closed before send: ${this.identity}`)
    }
    socket.send(payload)
  }

  async close(_reason?: unknown): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#opened = false
    const socket = this.#socket
    this.#socket = null
    socket?.close(1000, "Oracle channel closed")
    this.#events.clear()
  }

  async #retryOpen(options: OracleTransportOpenOptions): Promise<OracleChannel> {
    const waitMs = options.waitMs ?? 0
    const retryMs = Math.max(1, options.retryMs ?? 50)
    const deadline = Date.now() + waitMs
    while (true) {
      try {
        await this.#connect(options.requestTimeoutMs ?? 10_000)
        return this.channel
      } catch (error) {
        if (this.#closed || Date.now() >= deadline) throw error
        await sleep(Math.min(retryMs, Math.max(1, deadline - Date.now())))
      }
    }
  }

  #connect(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const address = new URL(this.#address)
      address.searchParams.set("identity", this.identity)
      address.searchParams.set("id", this.#id)
      const socket = new WebSocket(address)
      this.#socket = socket
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.close()
        reject(new Error(`Timed out opening Oracle WebSocket: ${this.identity}`))
      }, timeoutMs)

      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.#socket === socket) this.#socket = null
        reject(error)
      }

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          kind: "oracle.open",
          version: ORACLE_RPC_VERSION,
          identity: this.identity,
          methods: this.#methods,
        } satisfies OracleWebSocketOpening))
      })
      socket.addEventListener("message", (event) => {
        let value: unknown
        try {
          const text = String(event.data)
          if (jsonBytes(text) > ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES) {
            throw new Error("Oracle WebSocket payload exceeds limit")
          }
          value = JSON.parse(text) as unknown
        } catch (error) {
          socket.close(1003, "Invalid Oracle WebSocket message")
          fail(error instanceof Error ? error : new Error(String(error)))
          return
        }

        if (!this.#opened) {
          if (!isOpened(value, this.identity)) {
            socket.close(1003, "Invalid Oracle WebSocket acknowledgement")
            fail(new Error("Dark returned an invalid Oracle WebSocket acknowledgement"))
            return
          }
          settled = true
          clearTimeout(timer)
          this.#opened = true
          resolve()
          return
        }

        if (!isRpcMessage(value)) {
          socket.close(1003, "Invalid Oracle RPC message")
          return
        }
        void this.#events.emit(value).catch((error) => {
          console.error(`[${this.identity}] Oracle WebSocket receive failed`, error)
          socket.close(1011, "Oracle receive failed")
        })
      })
      socket.addEventListener("error", () => {
        fail(new Error(`Could not connect Oracle WebSocket: ${this.identity}`))
      })
      socket.addEventListener("close", () => {
        if (this.#socket === socket) this.#socket = null
        const wasOpened = this.#opened
        this.#opened = false
        if (!wasOpened) fail(new Error(`Oracle WebSocket closed before opening: ${this.identity}`))
      })
    })
  }
}
