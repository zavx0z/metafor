export interface WebPushSubscriptionJSON {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export interface WebPushRegistrationRequest {
  schema: 1
  operationId: string
  subscription: WebPushSubscriptionJSON
}

export function validateWebPushRegistrationRequest(value: unknown): WebPushRegistrationRequest {
  if (!isRecord(value) || value.schema !== 1) throw new Error("Invalid Web Push registration schema")
  if (!validPublicId(value.operationId)) throw new Error("Invalid Web Push registration operationId")
  return {
    schema: 1,
    operationId: value.operationId,
    subscription: validateWebPushSubscription(value.subscription),
  }
}

export interface WebPushRegistrationAccepted {
  schema: 1
  accepted: true
  subscriptionId: string
  registeredAt: number
}

export interface WebPushRegistrationRejected {
  schema: 1
  accepted: false
  reason: string
}

export type WebPushRegistrationAck =
  | WebPushRegistrationAccepted
  | WebPushRegistrationRejected

export interface WebPushNotification {
  title: string
  body?: string
  icon?: string
  badge?: string
  tag?: string
  data?: JsonRecord
}

export interface WebPushMessage<TData extends JsonValue = JsonValue> {
  schema: 1
  messageId: string
  operationId: string
  notification: WebPushNotification
  data?: TData
}

export interface WebPushDeliveryReceipt {
  schema: 1
  messageId: string
  operationId: string
  receivedAt: number
}

export function validateWebPushRegistrationAck(value: unknown): WebPushRegistrationAck {
  if (!isRecord(value) || value.schema !== 1 || typeof value.accepted !== "boolean") {
    throw new Error("Invalid Web Push registration acknowledgement")
  }
  if (!value.accepted) {
    if (typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 256) {
      throw new Error("Invalid Web Push registration rejection")
    }
    return {schema: 1, accepted: false, reason: value.reason}
  }
  if (!validPublicId(value.subscriptionId) || typeof value.registeredAt !== "number" || !Number.isFinite(value.registeredAt)) {
    throw new Error("Invalid Web Push registration acceptance")
  }
  return {
    schema: 1,
    accepted: true,
    subscriptionId: value.subscriptionId,
    registeredAt: value.registeredAt,
  }
}

export function validateWebPushDeliveryReceipt(value: unknown): WebPushDeliveryReceipt {
  if (!isRecord(value) || value.schema !== 1) throw new Error("Invalid Web Push receipt schema")
  if (!validPublicId(value.messageId)) throw new Error("Invalid Web Push receipt messageId")
  if (!validPublicId(value.operationId)) throw new Error("Invalid Web Push receipt operationId")
  if (typeof value.receivedAt !== "number" || !Number.isFinite(value.receivedAt)) {
    throw new Error("Invalid Web Push receipt timestamp")
  }
  return {
    schema: 1,
    messageId: value.messageId,
    operationId: value.operationId,
    receivedAt: value.receivedAt,
  }
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord
export interface JsonRecord {
  [key: string]: JsonValue
}

export function validateWebPushSubscription(value: unknown): WebPushSubscriptionJSON {
  if (!isRecord(value)) throw new Error("Invalid PushSubscription")
  const endpoint = value.endpoint
  const keys = value.keys
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 4_096) {
    throw new Error("Invalid PushSubscription endpoint")
  }
  const endpointUrl = new URL(endpoint)
  if (endpointUrl.protocol !== "https:") {
    throw new Error("PushSubscription endpoint must use HTTPS")
  }
  if (!isRecord(keys) || !validBase64Url(keys.p256dh, 512) || !validBase64Url(keys.auth, 256)) {
    throw new Error("Invalid PushSubscription keys")
  }
  const expirationTime = value.expirationTime
  if (
    expirationTime !== undefined &&
    expirationTime !== null &&
    (!Number.isFinite(expirationTime) || typeof expirationTime !== "number")
  ) {
    throw new Error("Invalid PushSubscription expiration")
  }
  return {
    endpoint,
    ...(expirationTime === undefined ? {} : {expirationTime}),
    keys: {p256dh: keys.p256dh, auth: keys.auth},
  }
}

export function validateWebPushMessage(value: unknown): WebPushMessage {
  if (!isRecord(value) || value.schema !== 1) throw new Error("Invalid Web Push message schema")
  if (!validPublicId(value.messageId)) throw new Error("Invalid Web Push messageId")
  if (!validPublicId(value.operationId)) throw new Error("Invalid Web Push operationId")
  if (!isRecord(value.notification)) throw new Error("Invalid Web Push notification")
  const notification = validateNotification(value.notification)
  if (value.data !== undefined && !isJsonValue(value.data)) throw new Error("Invalid Web Push data")
  return {
    schema: 1,
    messageId: value.messageId,
    operationId: value.operationId,
    notification,
    ...(value.data === undefined ? {} : {data: value.data}),
  }
}

export function validPublicId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateNotification(value: Record<string, unknown>): WebPushNotification {
  if (typeof value.title !== "string" || value.title.length === 0 || value.title.length > 256) {
    throw new Error("Invalid Web Push notification title")
  }
  const output: WebPushNotification = {title: value.title}
  for (const key of ["body", "icon", "badge", "tag"] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (typeof field !== "string" || field.length > 2_048) {
      throw new Error(`Invalid Web Push notification ${key}`)
    }
    output[key] = field
  }
  if (value.data !== undefined) {
    if (!isRecord(value.data) || !isJsonValue(value.data)) throw new Error("Invalid Web Push notification data")
    output.data = value.data as JsonRecord
  }
  return output
}

function validBase64Url(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value)
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 20) return false
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((entry) => isJsonValue(entry, depth + 1))
  if (!isRecord(value) || Object.keys(value).length > 1_000) return false
  return Object.values(value).every((entry) => isJsonValue(entry, depth + 1))
}
