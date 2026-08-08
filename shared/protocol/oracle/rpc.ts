export const ORACLE_RPC_VERSION = 1 as const

/** Transport-neutral request emitted by one domain Oracle. */
export type OracleRpcCall = {
  version: typeof ORACLE_RPC_VERSION
  id: string
  target: string
  method: string
  params: unknown
}

/** Request after Dark Oracle has attached the source-channel identity. */
export type RoutedOracleRpcCall = OracleRpcCall & {
  source: string
}

export type OracleRpcErrorCode =
  | "invalid_request"
  | "provider_unavailable"
  | "method_unavailable"
  | "transport_error"
  | "invalid_response"
  | "method_error"

export type OracleRpcSuccess<T = unknown> = {
  version: typeof ORACLE_RPC_VERSION
  id: string
  ok: true
  result: T
}

export type OracleRpcFailure = {
  version: typeof ORACLE_RPC_VERSION
  id: string
  ok: false
  error: {
    code: OracleRpcErrorCode
    message: string
  }
}

export type OracleRpcResponse<T = unknown> = OracleRpcSuccess<T> | OracleRpcFailure

/** Any RPC message carried by a logical OracleChannel. */
export type OracleRpcMessage = OracleRpcCall | RoutedOracleRpcCall | OracleRpcResponse

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const nonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const isOracleRpcCall = (value: unknown): value is OracleRpcCall =>
  isRecord(value) &&
  value.version === ORACLE_RPC_VERSION &&
  nonEmptyText(value.id) &&
  nonEmptyText(value.target) &&
  nonEmptyText(value.method) &&
  Object.prototype.hasOwnProperty.call(value, "params")

export const isRoutedOracleRpcCall = (value: unknown): value is RoutedOracleRpcCall =>
  isOracleRpcCall(value) && isRecord(value) && nonEmptyText((value as Record<string, unknown>).source)

export const isOracleRpcResponse = (value: unknown): value is OracleRpcResponse => {
  if (!isRecord(value) || value.version !== ORACLE_RPC_VERSION || !nonEmptyText(value.id)) return false
  if (value.ok === true) return Object.prototype.hasOwnProperty.call(value, "result")
  return value.ok === false &&
    isRecord(value.error) &&
    nonEmptyText(value.error.code) &&
    nonEmptyText(value.error.message)
}

export const oracleRpcFailure = (
  id: string,
  code: OracleRpcErrorCode,
  message: string,
): OracleRpcFailure => ({
  version: ORACLE_RPC_VERSION,
  id,
  ok: false,
  error: {code, message},
})
