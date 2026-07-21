import type {
  MonadRpcErrorCode,
  MonadRpcMessage,
} from "../../protocol/monad/rpc.ts"

export type MonadChannelListener = (message: MonadRpcMessage) => void | Promise<void>

/**
 * Permanent logical connection of one Monad to Force.
 *
 * A channel carries RPC messages but does not interpret calls, invoke methods or
 * know whether its physical transport is REST or WebRTC.
 */
export interface MonadChannel {
  readonly identity: string
  readonly methods: readonly string[]
  send(message: MonadRpcMessage): Promise<void>
  subscribe(listener: MonadChannelListener): () => void
  close(reason?: unknown): Promise<void>
}

export class MonadRpcRemoteError extends Error {
  constructor(readonly code: MonadRpcErrorCode, message: string) {
    super(message)
    this.name = "MonadRpcRemoteError"
  }
}

export const normalizeMonadIdentity = (value: string): string => {
  const identity = value.trim()
  if (!identity) throw new Error("Monad channel identity is required")
  return identity
}

/** Small delivery primitive shared by physical Monad transport adapters. */
export class MonadChannelEvents {
  readonly #listeners = new Set<MonadChannelListener>()

  subscribe(listener: MonadChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async emit(message: MonadRpcMessage): Promise<void> {
    await Promise.all([...this.#listeners].map((listener) => listener(message)))
  }

  clear(): void {
    this.#listeners.clear()
  }
}
