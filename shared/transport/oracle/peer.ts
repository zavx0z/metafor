import {
  ORACLE_RPC_VERSION,
  isOracleRpcResponse,
  isRoutedOracleRpcCall,
  oracleRpcFailure,
  type OracleRpcCall,
  type OracleRpcResponse,
  type RoutedOracleRpcCall,
} from "../../protocol/oracle/rpc.ts"
import {
  OracleRpcRemoteError,
  type OracleChannel,
} from "./channel.ts"

export type OracleRpcWaitOptions = {
  waitMs?: number
  retryMs?: number
}

export type OracleRpcContext = {
  readonly source: string
}

export type OracleRpcHandler = (
  params: unknown,
  context: OracleRpcContext,
) => unknown | Promise<unknown>

type PendingCall = {
  resolve(value: unknown): void
  reject(reason: unknown): void
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const isRetryable = (error: unknown): boolean =>
  !(error instanceof OracleRpcRemoteError) ||
  error.code === "provider_unavailable" ||
  error.code === "transport_error"

/** Transport-neutral RPC participant living above one OracleChannel. */
export class OracleRpcPeer {
  readonly #handlers = new Map<string, OracleRpcHandler>()
  readonly #pending = new Map<string, PendingCall>()
  readonly #unsubscribe: () => void

  constructor(readonly channel: OracleChannel) {
    this.#unsubscribe = channel.subscribe((message) => this.#receive(message))
  }

  expose(method: string, handler: OracleRpcHandler): void {
    const normalized = method.trim()
    if (!normalized) throw new Error("Oracle RPC method is required")
    this.#handlers.set(normalized, handler)
  }

  methods(): string[] {
    return [...this.#handlers.keys()].sort()
  }

  async call<T>(
    target: string,
    method: string,
    params: unknown,
    options: OracleRpcWaitOptions = {},
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

  close(reason: unknown = new Error("Oracle RPC peer closed")): void {
    this.#unsubscribe()
    for (const pending of this.#pending.values()) pending.reject(reason)
    this.#pending.clear()
  }

  async #callOnce<T>(target: string, method: string, params: unknown): Promise<T> {
    const call: OracleRpcCall = {
      version: ORACLE_RPC_VERSION,
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
    if (isOracleRpcResponse(message)) {
      this.#receiveResponse(message)
      return
    }
    if (isRoutedOracleRpcCall(message)) await this.#receiveCall(message)
  }

  #receiveResponse(response: OracleRpcResponse): void {
    const pending = this.#pending.get(response.id)
    if (!pending) return
    this.#pending.delete(response.id)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new OracleRpcRemoteError(response.error.code, response.error.message))
  }

  async #receiveCall(call: RoutedOracleRpcCall): Promise<void> {
    if (call.target !== this.channel.identity) {
      await this.channel.send(oracleRpcFailure(call.id, "invalid_request", "Oracle RPC target does not match its channel"))
      return
    }
    const handler = this.#handlers.get(call.method)
    if (!handler) {
      await this.channel.send(oracleRpcFailure(call.id, "method_unavailable", `Oracle RPC method is unavailable: ${call.method}`))
      return
    }
    try {
      const result = await handler(call.params, {source: call.source})
      await this.channel.send({version: ORACLE_RPC_VERSION, id: call.id, ok: true, result})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.channel.send(oracleRpcFailure(call.id, "method_error", message))
    }
  }
}
