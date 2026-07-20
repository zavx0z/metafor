import {
  MONAD_RPC_VERSION,
  type MonadRpcCall,
  type MonadRpcErrorCode,
  type MonadRpcFailure,
  type MonadRpcResponse,
} from "shared/protocol/monad/rpc"
import type {MonadChannel} from "shared/transport/monad"

type Provider = {
  methods: Set<string>
  channel: MonadChannel
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const nonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const isMonadRpcCall = (value: unknown): value is MonadRpcCall =>
  isRecord(value) &&
  value.version === MONAD_RPC_VERSION &&
  nonEmptyText(value.id) &&
  nonEmptyText(value.target) &&
  nonEmptyText(value.method) &&
  Object.prototype.hasOwnProperty.call(value, "params")

export const isMonadRpcResponse = (value: unknown): value is MonadRpcResponse => {
  if (!isRecord(value) || value.version !== MONAD_RPC_VERSION || !nonEmptyText(value.id)) return false
  if (value.ok === true) return Object.prototype.hasOwnProperty.call(value, "result")
  return value.ok === false && isRecord(value.error) && nonEmptyText(value.error.code) && nonEmptyText(value.error.message)
}

const failure = (id: string, code: MonadRpcErrorCode, message: string): MonadRpcFailure => ({
  version: MONAD_RPC_VERSION,
  id,
  ok: false,
  error: {code, message},
})

/**
 * Transport-neutral service router between domain Monads.
 *
 * A transport registers a provider channel. The router attaches the channel
 * source identity, correlates the response and never interprets domain data.
 */
export class MonadRouter {
  #providers = new Map<string, Provider>()

  register(channel: MonadChannel, methods: readonly string[]): void {
    const normalizedIdentity = channel.identity.trim()
    const normalizedMethods = methods.map((method) => method.trim()).filter(Boolean)
    if (!normalizedIdentity) throw new Error("Monad RPC provider identity is required")
    if (normalizedMethods.length === 0) throw new Error("Monad RPC provider must expose at least one method")
    this.#providers.set(normalizedIdentity, {methods: new Set(normalizedMethods), channel})
  }

  unregister(identity: string): void {
    this.#providers.delete(identity)
  }

  providers(): Array<{identity: string; methods: string[]}> {
    return [...this.#providers.entries()].map(([identity, provider]) => ({
      identity,
      methods: [...provider.methods].sort(),
    }))
  }

  async route(source: string, call: MonadRpcCall): Promise<MonadRpcResponse> {
    const provider = this.#providers.get(call.target)
    if (!provider) {
      return failure(call.id, "provider_unavailable", `Monad RPC provider is unavailable: ${call.target}`)
    }
    if (!provider.methods.has(call.method)) {
      return failure(call.id, "method_unavailable", `Monad RPC method is unavailable: ${call.method}`)
    }

    let response: MonadRpcResponse
    try {
      response = await provider.channel.invoke({...call, source})
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return failure(call.id, "transport_error", `${call.target} transport failed: ${reason}`)
    }

    if (!isMonadRpcResponse(response) || response.id !== call.id) {
      return failure(call.id, "invalid_response", `${call.target} returned an invalid RPC response`)
    }
    return response
  }
}
