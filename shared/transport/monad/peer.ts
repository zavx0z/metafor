import {
  MONAD_RPC_VERSION,
  isMonadRpcResponse,
  isRoutedMonadRpcCall,
  monadRpcFailure,
  type MonadRpcCall,
  type MonadRpcResponse,
  type RoutedMonadRpcCall,
} from "../../protocol/monad/rpc.ts"
import {
  MonadRpcRemoteError,
  type MonadChannel,
} from "./channel.ts"

export type MonadRpcWaitOptions = {
  waitMs?: number
  retryMs?: number
}

export type MonadRpcContext = {
  readonly source: string
}

export type MonadRpcHandler = (
  params: unknown,
  context: MonadRpcContext,
) => unknown | Promise<unknown>

type PendingCall = {
  resolve(value: unknown): void
  reject(reason: unknown): void
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const isRetryable = (error: unknown): boolean =>
  !(error instanceof MonadRpcRemoteError) ||
  error.code === "provider_unavailable" ||
  error.code === "transport_error"

/** Transport-neutral RPC participant living above one MonadChannel. */
export class MonadRpcPeer {
  readonly #handlers = new Map<string, MonadRpcHandler>()
  readonly #pending = new Map<string, PendingCall>()
  readonly #unsubscribe: () => void

  constructor(readonly channel: MonadChannel) {
    this.#unsubscribe = channel.subscribe((message) => this.#receive(message))
  }

  expose(method: string, handler: MonadRpcHandler): void {
    const normalized = method.trim()
    if (!normalized) throw new Error("Monad RPC method is required")
    this.#handlers.set(normalized, handler)
  }

  methods(): string[] {
    return [...this.#handlers.keys()].sort()
  }

  async call<T>(
    target: string,
    method: string,
    params: unknown,
    options: MonadRpcWaitOptions = {},
  ): Promise<T> {
    const waitMs = options.waitMs ?? 0
    const deadline = Date.now() + waitMs
    while (true) {
      try {
        return await this.#callOnce<T>(target, method, params)
      } catch (error) {
        if (!isRetryable(error) || Date.now() >= deadline) throw error
        await wait(Math.max(1, options.retryMs ?? 50))
      }
    }
  }

  close(reason: unknown = new Error("Monad RPC peer closed")): void {
    this.#unsubscribe()
    for (const pending of this.#pending.values()) pending.reject(reason)
    this.#pending.clear()
  }

  async #callOnce<T>(target: string, method: string, params: unknown): Promise<T> {
    const call: MonadRpcCall = {
      version: MONAD_RPC_VERSION,
      id: crypto.randomUUID(),
      target,
      method,
      params,
    }
    const response = new Promise<T>((resolve, reject) => {
      this.#pending.set(call.id, {resolve, reject})
    })
    try {
      await this.channel.send(call)
    } catch (error) {
      this.#pending.delete(call.id)
      throw error
    }
    return await response
  }

  async #receive(message: unknown): Promise<void> {
    if (isMonadRpcResponse(message)) {
      this.#receiveResponse(message)
      return
    }
    if (isRoutedMonadRpcCall(message)) await this.#receiveCall(message)
  }

  #receiveResponse(response: MonadRpcResponse): void {
    const pending = this.#pending.get(response.id)
    if (!pending) return
    this.#pending.delete(response.id)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new MonadRpcRemoteError(response.error.code, response.error.message))
  }

  async #receiveCall(call: RoutedMonadRpcCall): Promise<void> {
    if (call.target !== this.channel.identity) {
      await this.channel.send(monadRpcFailure(call.id, "invalid_request", "Monad RPC target does not match its channel"))
      return
    }
    const handler = this.#handlers.get(call.method)
    if (!handler) {
      await this.channel.send(monadRpcFailure(call.id, "method_unavailable", `Monad RPC method is unavailable: ${call.method}`))
      return
    }
    try {
      const result = await handler(call.params, {source: call.source})
      await this.channel.send({version: MONAD_RPC_VERSION, id: call.id, ok: true, result})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.channel.send(monadRpcFailure(call.id, "method_error", message))
    }
  }
}
