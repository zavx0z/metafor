export const MONAD_RPC_VERSION = 1 as const

/** Transport-neutral request emitted by one domain Monad. */
export type MonadRpcCall = {
  version: typeof MONAD_RPC_VERSION
  id: string
  target: string
  method: string
  params: unknown
}

/** Request after Force has attached the source-channel identity. */
export type RoutedMonadRpcCall = MonadRpcCall & {
  source: string
}

export type MonadRpcErrorCode =
  | "invalid_request"
  | "provider_unavailable"
  | "method_unavailable"
  | "transport_error"
  | "invalid_response"
  | "method_error"

export type MonadRpcSuccess<T = unknown> = {
  version: typeof MONAD_RPC_VERSION
  id: string
  ok: true
  result: T
}

export type MonadRpcFailure = {
  version: typeof MONAD_RPC_VERSION
  id: string
  ok: false
  error: {
    code: MonadRpcErrorCode
    message: string
  }
}

export type MonadRpcResponse<T = unknown> = MonadRpcSuccess<T> | MonadRpcFailure
