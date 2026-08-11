import {isRecord, validPublicId} from "./protocol.ts"

export const WEB_PUSH_LIFECYCLE_TYPES = [
  "client.supported",
  "client.unsupported",
  "client.permission-requested",
  "client.permission-granted",
  "client.permission-denied",
  "client.permission-dismissed",
  "client.subscription-restored",
  "client.subscription-created",
  "client.subscription-rotated",
  "client.registration-accepted",
  "client.registration-rejected",
  "client.unsubscribed",
  "client.unsubscribe-failed",
  "worker.push-received",
  "worker.push-rejected",
  "worker.notification-shown",
  "worker.notification-failed",
  "worker.notification-clicked",
  "worker.receipt-confirmed",
  "worker.receipt-failed",
  "server.vapid-ready",
  "server.subscription-stored",
  "server.subscription-replaced",
  "server.subscription-rejected",
  "server.subscription-removed",
  "server.push-queued",
  "server.push-dispatched",
  "server.push-accepted",
  "server.push-failed",
  "server.receipt-confirmed",
  "server.receipt-timed-out",
] as const

export type WebPushLifecycleType = typeof WEB_PUSH_LIFECYCLE_TYPES[number]
export type WebPushLifecycleSource = "client" | "worker" | "server"
export type WebPushPermissionDetail = {permission: "default" | "granted" | "denied"}
export type WebPushSubscriptionDetail = {subscriptionId: string}
export type WebPushReasonDetail = {reason: string}
export type WebPushMessageDetail = {messageId: string}

interface WebPushLifecycleDetailByType {
  "client.supported": undefined
  "client.unsupported": undefined
  "client.permission-requested": WebPushPermissionDetail
  "client.permission-granted": WebPushPermissionDetail
  "client.permission-denied": WebPushPermissionDetail
  "client.permission-dismissed": WebPushPermissionDetail
  "client.subscription-restored": undefined
  "client.subscription-created": undefined
  "client.subscription-rotated": undefined
  "client.registration-accepted": WebPushSubscriptionDetail
  "client.registration-rejected": WebPushReasonDetail
  "client.unsubscribed": WebPushSubscriptionDetail
  "client.unsubscribe-failed": WebPushSubscriptionDetail & WebPushReasonDetail
  "worker.push-received": WebPushMessageDetail
  "worker.push-rejected": WebPushReasonDetail
  "worker.notification-shown": WebPushMessageDetail
  "worker.notification-failed": WebPushMessageDetail & WebPushReasonDetail
  "worker.notification-clicked": WebPushMessageDetail
  "worker.receipt-confirmed": WebPushMessageDetail
  "worker.receipt-failed": WebPushMessageDetail & WebPushReasonDetail
  "server.vapid-ready": undefined
  "server.subscription-stored": WebPushSubscriptionDetail
  "server.subscription-replaced": WebPushSubscriptionDetail
  "server.subscription-rejected": WebPushSubscriptionDetail & WebPushReasonDetail
  "server.subscription-removed": WebPushSubscriptionDetail & {messageId?: string; statusCode?: number}
  "server.push-queued": WebPushSubscriptionDetail & WebPushMessageDetail
  "server.push-dispatched": WebPushSubscriptionDetail & WebPushMessageDetail
  "server.push-accepted": WebPushSubscriptionDetail & WebPushMessageDetail & {statusCode?: number}
  "server.push-failed": WebPushSubscriptionDetail & WebPushMessageDetail & WebPushReasonDetail & {statusCode?: number}
  "server.receipt-confirmed": WebPushMessageDetail & {subscriptionId?: string}
  "server.receipt-timed-out": WebPushMessageDetail
}

export type WebPushLifecycleDetail = Exclude<
  WebPushLifecycleDetailByType[WebPushLifecycleType],
  undefined
>

type WebPushLifecycleSourceForType<T extends WebPushLifecycleType> =
  T extends `client.${string}` ? "client" :
    T extends `worker.${string}` ? "worker" : "server"

type WebPushLifecycleTypesForSource<S extends WebPushLifecycleSource> = {
  [T in WebPushLifecycleType]: WebPushLifecycleSourceForType<T> extends S ? T : never
}[WebPushLifecycleType]

type WebPushLifecycleDetailField<T extends WebPushLifecycleType> =
  WebPushLifecycleDetailByType[T] extends undefined
    ? {detail?: never}
    : {detail: WebPushLifecycleDetailByType[T]}

type WebPushLifecycleEventForType<T extends WebPushLifecycleType> = {
  schema: 1
  eventId: string
  operationId: string
  at: number
  source: WebPushLifecycleSourceForType<T>
  type: T
  subjectId?: string
} & WebPushLifecycleDetailField<T>

export type WebPushLifecycleEvent = {
  [T in WebPushLifecycleType]: WebPushLifecycleEventForType<T>
}[WebPushLifecycleType]

type WebPushLifecycleInputForType<T extends WebPushLifecycleType> = {
  type: T
  operationId: string
  subjectId?: string
} & WebPushLifecycleDetailField<T>

export type WebPushLifecycleHook = (event: WebPushLifecycleEvent) => void | Promise<void>

export interface WebPushLifecycleEmitter<S extends WebPushLifecycleSource = WebPushLifecycleSource> {
  emit<T extends WebPushLifecycleTypesForSource<S>>(
    input: WebPushLifecycleInputForType<T>,
  ): WebPushLifecycleEventForType<T>
}

type WebPushLifecycleDetailKey = "permission" | "subscriptionId" | "messageId" | "statusCode" | "reason"

const DETAIL_FIELDS = {
  "client.supported": {required: [], optional: []},
  "client.unsupported": {required: [], optional: []},
  "client.permission-requested": {required: ["permission"], optional: []},
  "client.permission-granted": {required: ["permission"], optional: []},
  "client.permission-denied": {required: ["permission"], optional: []},
  "client.permission-dismissed": {required: ["permission"], optional: []},
  "client.subscription-restored": {required: [], optional: []},
  "client.subscription-created": {required: [], optional: []},
  "client.subscription-rotated": {required: [], optional: []},
  "client.registration-accepted": {required: ["subscriptionId"], optional: []},
  "client.registration-rejected": {required: ["reason"], optional: []},
  "client.unsubscribed": {required: ["subscriptionId"], optional: []},
  "client.unsubscribe-failed": {required: ["subscriptionId", "reason"], optional: []},
  "worker.push-received": {required: ["messageId"], optional: []},
  "worker.push-rejected": {required: ["reason"], optional: []},
  "worker.notification-shown": {required: ["messageId"], optional: []},
  "worker.notification-failed": {required: ["messageId", "reason"], optional: []},
  "worker.notification-clicked": {required: ["messageId"], optional: []},
  "worker.receipt-confirmed": {required: ["messageId"], optional: []},
  "worker.receipt-failed": {required: ["messageId", "reason"], optional: []},
  "server.vapid-ready": {required: [], optional: []},
  "server.subscription-stored": {required: ["subscriptionId"], optional: []},
  "server.subscription-replaced": {required: ["subscriptionId"], optional: []},
  "server.subscription-rejected": {required: ["subscriptionId", "reason"], optional: []},
  "server.subscription-removed": {required: ["subscriptionId"], optional: ["messageId", "statusCode"]},
  "server.push-queued": {required: ["subscriptionId", "messageId"], optional: []},
  "server.push-dispatched": {required: ["subscriptionId", "messageId"], optional: []},
  "server.push-accepted": {required: ["subscriptionId", "messageId"], optional: ["statusCode"]},
  "server.push-failed": {required: ["subscriptionId", "messageId", "reason"], optional: ["statusCode"]},
  "server.receipt-confirmed": {required: ["messageId"], optional: ["subscriptionId"]},
  "server.receipt-timed-out": {required: ["messageId"], optional: []},
} as const satisfies Record<WebPushLifecycleType, {
  required: readonly WebPushLifecycleDetailKey[]
  optional: readonly WebPushLifecycleDetailKey[]
}>

const EVENT_FIELDS = new Set(["schema", "eventId", "operationId", "at", "source", "type", "subjectId", "detail"])

const SAFE_LIFECYCLE_REASONS = new Set([
  "AbortError",
  "DataError",
  "Error",
  "InvalidStateError",
  "NetworkError",
  "NotAllowedError",
  "NotFoundError",
  "NotSupportedError",
  "OperationError",
  "QuotaExceededError",
  "RedactedError",
  "RegistrationRejected",
  "SecurityError",
  "SubscriptionNotFound",
  "TimeoutError",
  "TypeError",
  "UnknownError",
])

export function createWebPushLifecycleEmitter<S extends WebPushLifecycleSource>(options: {
  source: S
  onLifecycle?: WebPushLifecycleHook | undefined
  now?: () => number
  createId?: () => string
}): WebPushLifecycleEmitter<S> {
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultId
  return {
    emit<T extends WebPushLifecycleTypesForSource<S>>(input: WebPushLifecycleInputForType<T>) {
      if (sourceForType(input.type) !== options.source) {
        throw new Error(`Lifecycle type ${input.type} does not belong to ${options.source}`)
      }
      if (!validPublicId(input.operationId)) throw new Error("Invalid lifecycle operationId")
      if (input.subjectId !== undefined && !validPublicId(input.subjectId)) {
        throw new Error("Invalid lifecycle subjectId")
      }
      const detail = input.detail === undefined ? undefined : sanitizeDetail(input.type, input.detail)
      const candidate = {
        schema: 1,
        eventId: createId(),
        operationId: input.operationId,
        at: now(),
        source: options.source,
        type: input.type,
        ...(input.subjectId === undefined ? {} : {subjectId: input.subjectId}),
        ...(detail === undefined ? {} : {detail}),
      }
      if (!isWebPushLifecycleEvent(candidate)) throw new Error("Invalid lifecycle event")
      const event = candidate as unknown as WebPushLifecycleEventForType<T>
      callHook(options.onLifecycle, event as unknown as WebPushLifecycleEvent)
      return event
    },
  }
}

export function composeWebPushLifecycleHooks(
  ...hooks: Array<WebPushLifecycleHook | undefined>
): WebPushLifecycleHook | undefined {
  const present = hooks.filter((hook): hook is WebPushLifecycleHook => hook !== undefined)
  if (present.length === 0) return undefined
  return (event) => {
    for (const hook of present) callHook(hook, event)
  }
}

export function isWebPushLifecycleEvent(value: unknown): value is WebPushLifecycleEvent {
  if (!isRecord(value) || Object.keys(value).some((key) => !EVENT_FIELDS.has(key)) || value.schema !== 1) return false
  if (!validPublicId(value.eventId) || !validPublicId(value.operationId)) return false
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return false
  if (typeof value.type !== "string" || !(WEB_PUSH_LIFECYCLE_TYPES as readonly string[]).includes(value.type)) return false
  const type = value.type as WebPushLifecycleType
  if (value.source !== sourceForType(type)) return false
  if (value.subjectId !== undefined && !validPublicId(value.subjectId)) return false
  return validDetailForType(type, value.detail)
}

function callHook(hook: WebPushLifecycleHook | undefined, event: WebPushLifecycleEvent): void {
  if (!hook) return
  try {
    const result = hook(event)
    if (isPromiseLike(result)) void result.catch(() => {})
  } catch {
    // An observer is not allowed to alter Web Push behavior.
  }
}

function sanitizeDetail(type: WebPushLifecycleType, detail: WebPushLifecycleDetail): WebPushLifecycleDetail {
  if (!validDetailForType(type, detail, true)) throw new Error("Invalid lifecycle detail")
  const input = detail as unknown as Record<WebPushLifecycleDetailKey, unknown>
  const safe: Record<string, unknown> = {}
  if (input.permission !== undefined) safe.permission = input.permission
  if (input.subscriptionId !== undefined) safe.subscriptionId = input.subscriptionId
  if (input.messageId !== undefined) safe.messageId = input.messageId
  if (input.statusCode !== undefined) safe.statusCode = input.statusCode
  if (typeof input.reason === "string") safe.reason = safeLifecycleReason(input.reason)
  return safe as WebPushLifecycleDetail
}

function safeLifecycleReason(reason: string): string {
  return SAFE_LIFECYCLE_REASONS.has(reason) ? reason : "RedactedError"
}

function validDetailForType(
  type: WebPushLifecycleType,
  value: unknown,
  allowUnclassifiedReason = false,
): value is WebPushLifecycleDetail | undefined {
  const shape = DETAIL_FIELDS[type]
  if (shape.required.length === 0 && shape.optional.length === 0) return value === undefined
  if (!isRecord(value)) return false
  const allowed = new Set<string>([...shape.required, ...shape.optional])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
  if (shape.required.some((key) => value[key] === undefined)) return false
  if (value.permission !== undefined && value.permission !== "default" && value.permission !== "granted" && value.permission !== "denied") return false
  if (value.subscriptionId !== undefined && !validPublicId(value.subscriptionId)) return false
  if (value.messageId !== undefined && !validPublicId(value.messageId)) return false
  if (value.statusCode !== undefined && (
    typeof value.statusCode !== "number" ||
    !Number.isInteger(value.statusCode) ||
    value.statusCode < 100 ||
    value.statusCode > 599
  )) return false
  if (value.reason !== undefined && (
    typeof value.reason !== "string" ||
    value.reason.length > 256 ||
    (!allowUnclassifiedReason && !SAFE_LIFECYCLE_REASONS.has(value.reason))
  )) return false
  return true
}

function sourceForType(type: WebPushLifecycleType): WebPushLifecycleSource {
  if (type.startsWith("client.")) return "client"
  if (type.startsWith("worker.")) return "worker"
  return "server"
}

function isPromiseLike(value: unknown): value is PromiseLike<void> & {catch(onRejected: () => void): unknown} {
  return typeof value === "object" && value !== null && "then" in value && "catch" in value
}

let fallbackId = 0
function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  fallbackId += 1
  return `web-push-${Date.now()}-${fallbackId}`
}
