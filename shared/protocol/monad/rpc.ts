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

/** Any RPC message carried by a logical MonadChannel. */
export type MonadRpcMessage = MonadRpcCall | RoutedMonadRpcCall | MonadRpcResponse

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

export const isRoutedMonadRpcCall = (value: unknown): value is RoutedMonadRpcCall =>
  isMonadRpcCall(value) && isRecord(value) && nonEmptyText((value as Record<string, unknown>).source)

export const isMonadRpcResponse = (value: unknown): value is MonadRpcResponse => {
  if (!isRecord(value) || value.version !== MONAD_RPC_VERSION || !nonEmptyText(value.id)) return false
  if (value.ok === true) return Object.prototype.hasOwnProperty.call(value, "result")
  return value.ok === false &&
    isRecord(value.error) &&
    nonEmptyText(value.error.code) &&
    nonEmptyText(value.error.message)
}

export const monadRpcFailure = (
  id: string,
  code: MonadRpcErrorCode,
  message: string,
): MonadRpcFailure => ({
  version: MONAD_RPC_VERSION,
  id,
  ok: false,
  error: {code, message},
})
