import type {
  OracleRpcErrorCode,
  OracleRpcMessage,
} from "../../protocol/oracle/rpc.ts"

export type OracleChannelListener = (message: OracleRpcMessage) => void | Promise<void>

/**
 * Permanent logical connection of one RPC participant to Dark Oracle.
 *
 * A channel carries RPC messages but does not interpret calls, invoke methods or
 * know whether its physical transport is REST or WebRTC.
 */
export interface OracleChannel {
  readonly identity: string
  readonly methods: readonly string[]
  send(message: OracleRpcMessage): Promise<void>
  subscribe(listener: OracleChannelListener): () => void
  close(reason?: unknown): Promise<void>
}

export class OracleRpcRemoteError extends Error {
  constructor(readonly code: OracleRpcErrorCode, message: string) {
    super(message)
    this.name = "OracleRpcRemoteError"
  }
}

export const normalizeOracleIdentity = (value: string): string => {
  const identity = value.trim()
  if (!identity) throw new Error("Oracle channel identity is required")
  return identity
}

/** Small delivery primitive shared by physical Oracle transport adapters. */
export class OracleChannelEvents {
  readonly #listeners = new Set<OracleChannelListener>()

  subscribe(listener: OracleChannelListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async emit(message: OracleRpcMessage): Promise<void> {
    await Promise.all([...this.#listeners].map((listener) => listener(message)))
  }

  clear(): void {
    this.#listeners.clear()
  }
}
