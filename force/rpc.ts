import {
  isMonadRpcCall,
  isMonadRpcResponse,
  monadRpcFailure,
  type MonadRpcCall,
  type MonadRpcMessage,
  type MonadRpcResponse,
} from "shared/protocol/monad/rpc"
import {
  MonadRpcRemoteError,
  type MonadChannel,
} from "shared/transport/monad"

type AttachedChannel = {
  channel: MonadChannel
  methods: Set<string>
  unsubscribe: () => void
}

type PendingRoute = {
  source: MonadChannel
  target: MonadChannel
}

/**
 * Transport-neutral service router between permanent MonadChannels.
 *
 * The router attaches source identity from the incoming channel, checks the
 * target capabilities and routes the correlated response back through the
 * source channel. It knows nothing about REST, WebRTC or domain data.
 */
export class MonadRouter {
  readonly #attached = new Map<string, AttachedChannel>()
  readonly #pending = new Map<string, PendingRoute>()

  attach(channel: MonadChannel): void {
    const identity = channel.identity.trim()
    if (!identity) throw new Error("Monad channel identity is required")
    const previous = this.#attached.get(identity)
    if (previous?.channel === channel) return
    previous?.unsubscribe()
    const attached: AttachedChannel = {
      channel,
      methods: new Set(channel.methods.map((method) => method.trim()).filter(Boolean)),
      unsubscribe: () => {},
    }
    attached.unsubscribe = channel.subscribe((message) => this.#receive(channel, message))
    this.#attached.set(identity, attached)
  }

  detach(channel: MonadChannel): boolean {
    const attached = this.#attached.get(channel.identity)
    if (attached?.channel !== channel) return false
    attached.unsubscribe()
    this.#attached.delete(channel.identity)
    for (const [id, pending] of this.#pending) {
      if (pending.source === channel) {
        this.#pending.delete(id)
        continue
      }
      if (pending.target === channel) {
        this.#pending.delete(id)
        void pending.source.send(monadRpcFailure(id, "provider_unavailable", `Monad RPC provider is unavailable: ${channel.identity}`))
      }
    }
    return true
  }

  channels(): Array<{identity: string; methods: string[]}> {
    return [...this.#attached.values()]
      .map(({channel, methods}) => ({identity: channel.identity, methods: [...methods].sort()}))
      .sort((left, right) => left.identity.localeCompare(right.identity))
  }

  async #receive(channel: MonadChannel, message: MonadRpcMessage): Promise<void> {
    if (this.#attached.get(channel.identity)?.channel !== channel) return
    if (isMonadRpcResponse(message)) {
      await this.#routeResponse(channel, message)
      return
    }
    if (isMonadRpcCall(message)) await this.#routeCall(channel, message)
  }

  async #routeCall(source: MonadChannel, call: MonadRpcCall): Promise<void> {
    if (this.#pending.has(call.id)) {
      await source.send(monadRpcFailure(call.id, "invalid_request", `Monad RPC call id is already pending: ${call.id}`))
      return
    }
    const target = this.#attached.get(call.target)
    if (!target) {
      await source.send(monadRpcFailure(call.id, "provider_unavailable", `Monad RPC provider is unavailable: ${call.target}`))
      return
    }
    if (!target.methods.has(call.method)) {
      await source.send(monadRpcFailure(call.id, "method_unavailable", `Monad RPC method is unavailable: ${call.method}`))
      return
    }

    this.#pending.set(call.id, {source, target: target.channel})
    try {
      await target.channel.send({...call, source: source.identity})
    } catch (error) {
      const pending = this.#pending.get(call.id)
      if (!pending || pending.source !== source || pending.target !== target.channel) return
      this.#pending.delete(call.id)
      const code = error instanceof MonadRpcRemoteError ? error.code : "transport_error"
      const reason = error instanceof Error ? error.message : String(error)
      await source.send(monadRpcFailure(call.id, code, `${call.target} transport failed: ${reason}`))
    }
  }

  async #routeResponse(target: MonadChannel, response: MonadRpcResponse): Promise<void> {
    const pending = this.#pending.get(response.id)
    if (!pending || pending.target !== target) return
    this.#pending.delete(response.id)
    await pending.source.send(response)
  }
}
