import {
  MONAD_RPC_VERSION,
  type MonadRpcCall,
  type MonadRpcErrorCode,
  type MonadRpcResponse,
  type RoutedMonadRpcCall,
} from "../../protocol/monad/rpc.ts"

export type MonadRpcWaitOptions = {
  waitMs?: number
  retryMs?: number
  requestTimeoutMs?: number
}

export class MonadRpcRemoteError extends Error {
  constructor(readonly code: MonadRpcErrorCode, message: string) {
    super(message)
    this.name = "MonadRpcRemoteError"
  }
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const isRetryable = (error: unknown): boolean =>
  !(error instanceof MonadRpcRemoteError) ||
  error.code === "provider_unavailable" ||
  error.code === "transport_error"

/** Initial REST transport for one MonadChannel to MonadRouter. */
export class BaseMonadRpcClient {
  readonly #base: URL
  readonly identity: string

  constructor(identity: string, address: string | URL) {
    this.identity = normalizeMonadIdentity(identity)
    this.#base = new URL(address)
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/"
  }

  async registerProvider(
    methods: readonly string[],
    endpoint: string | URL,
    options: MonadRpcWaitOptions = {},
  ): Promise<void> {
    const url = new URL(`monad/providers/${encodeURIComponent(this.identity)}`, this.#base)
    await this.#retry(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          version: MONAD_RPC_VERSION,
          methods,
          endpoint: String(endpoint),
        }),
        signal: AbortSignal.timeout(options.requestTimeoutMs ?? 10_000),
      })
      if (!response.ok) throw new Error(`Force rejected Monad RPC provider: HTTP ${response.status}`)
    }, options)
  }

  async invoke<T>(
    target: string,
    method: string,
    params: unknown,
    options: MonadRpcWaitOptions = {},
  ): Promise<T> {
    const call: MonadRpcCall = {
      version: MONAD_RPC_VERSION,
      id: crypto.randomUUID(),
      target,
      method,
      params,
    }
    const url = new URL(`monad/rpc/${encodeURIComponent(this.identity)}`, this.#base)
    return await this.#retry(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(call),
        signal: AbortSignal.timeout(options.requestTimeoutMs ?? 10_000),
      })
      const payload = await response.json() as MonadRpcResponse<T>
      if (payload.id !== call.id || payload.version !== MONAD_RPC_VERSION) {
        throw new MonadRpcRemoteError("invalid_response", "Force returned an invalid Monad RPC response")
      }
      if (!payload.ok) throw new MonadRpcRemoteError(payload.error.code, payload.error.message)
      return payload.result
    }, options)
  }

  async #retry<T>(task: () => Promise<T>, options: MonadRpcWaitOptions): Promise<T> {
    const waitMs = options.waitMs ?? 0
    const deadline = Date.now() + waitMs
    while (true) {
      try {
        return await task()
      } catch (error) {
        if (!isRetryable(error) || Date.now() >= deadline) throw error
        await wait(Math.max(1, options.retryMs ?? 50))
      }
    }
  }
}

/** One physical service channel identified independently from runtime domains. */
export type MonadChannel = {
  readonly identity: string
  invoke(call: RoutedMonadRpcCall): Promise<MonadRpcResponse>
}

export const normalizeMonadIdentity = (value: string): string => {
  const identity = value.trim()
  if (!identity) throw new Error("Monad channel identity is required")
  return identity
}

export type HttpMonadRpcProviderRegistration = {
  version: typeof MONAD_RPC_VERSION
  methods: string[]
  endpoint: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const readHttpProviderRegistration = (value: unknown): HttpMonadRpcProviderRegistration | null => {
  if (
    !isRecord(value) ||
    value.version !== MONAD_RPC_VERSION ||
    !Array.isArray(value.methods) ||
    !value.methods.every((method): method is string => typeof method === "string" && method.trim().length > 0) ||
    typeof value.endpoint !== "string"
  ) return null

  let endpoint: URL
  try {
    endpoint = new URL(value.endpoint)
  } catch {
    return null
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null
  return {
    version: MONAD_RPC_VERSION,
    methods: value.methods.map((method) => method.trim()),
    endpoint: endpoint.href,
  }
}

/** Initial HTTP adapter for one provider MonadChannel registered in the router. */
export const createHttpMonadChannel = (identity: string, endpoint: string): MonadChannel => ({
  identity: normalizeMonadIdentity(identity),
  async invoke(call): Promise<MonadRpcResponse> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(call),
      signal: AbortSignal.timeout(10_000),
    })
    try {
      // A non-2xx provider response may still be a valid correlated RPC
      // failure. The router validates its envelope and preserves its code.
      return await response.json() as MonadRpcResponse
    } catch {
      throw new Error(`HTTP ${response.status} returned no RPC envelope`)
    }
  },
})
