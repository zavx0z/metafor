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

export interface WebPushLifecycleDetail {
  permission?: "default" | "granted" | "denied"
  subscriptionId?: string
  messageId?: string
  statusCode?: number
  reason?: string
}

export interface WebPushLifecycleEvent {
  schema: 1
  eventId: string
  operationId: string
  at: number
  source: WebPushLifecycleSource
  type: WebPushLifecycleType
  subjectId?: string
  detail?: WebPushLifecycleDetail
}

export type WebPushLifecycleHook = (event: WebPushLifecycleEvent) => void | Promise<void>

export interface WebPushLifecycleEmitter {
  emit(input: {
    type: WebPushLifecycleType
    operationId: string
    subjectId?: string
    detail?: WebPushLifecycleDetail
  }): WebPushLifecycleEvent
}

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

export function createWebPushLifecycleEmitter(options: {
  source: WebPushLifecycleSource
  onLifecycle?: WebPushLifecycleHook | undefined
  now?: () => number
  createId?: () => string
}): WebPushLifecycleEmitter {
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultId
  return {
    emit(input) {
      if (!validPublicId(input.operationId)) throw new Error("Invalid lifecycle operationId")
      if (input.subjectId !== undefined && !validPublicId(input.subjectId)) {
        throw new Error("Invalid lifecycle subjectId")
      }
      const event: WebPushLifecycleEvent = {
        schema: 1,
        eventId: createId(),
        operationId: input.operationId,
        at: now(),
        source: options.source,
        type: input.type,
        ...(input.subjectId === undefined ? {} : {subjectId: input.subjectId}),
        ...(input.detail === undefined ? {} : {detail: sanitizeDetail(input.detail)}),
      }
      callHook(options.onLifecycle, event)
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
  if (!isRecord(value) || value.schema !== 1) return false
  if (!validPublicId(value.eventId) || !validPublicId(value.operationId)) return false
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return false
  if (value.source !== "client" && value.source !== "worker" && value.source !== "server") return false
  if (typeof value.type !== "string" || !(WEB_PUSH_LIFECYCLE_TYPES as readonly string[]).includes(value.type)) return false
  if (value.subjectId !== undefined && !validPublicId(value.subjectId)) return false
  if (value.detail !== undefined && !validDetail(value.detail)) return false
  return true
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

function sanitizeDetail(detail: WebPushLifecycleDetail): WebPushLifecycleDetail {
  if (!validDetail(detail, true)) throw new Error("Invalid lifecycle detail")
  return {
    ...(detail.permission === undefined ? {} : {permission: detail.permission}),
    ...(detail.subscriptionId === undefined ? {} : {subscriptionId: detail.subscriptionId}),
    ...(detail.messageId === undefined ? {} : {messageId: detail.messageId}),
    ...(detail.statusCode === undefined ? {} : {statusCode: detail.statusCode}),
    ...(detail.reason === undefined ? {} : {reason: safeLifecycleReason(detail.reason)}),
  }
}

function safeLifecycleReason(reason: string): string {
  return SAFE_LIFECYCLE_REASONS.has(reason) ? reason : "RedactedError"
}

function validDetail(value: unknown, allowUnclassifiedReason = false): value is WebPushLifecycleDetail {
  if (!isRecord(value)) return false
  const allowed = new Set(["permission", "subscriptionId", "messageId", "statusCode", "reason"])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
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

function isPromiseLike(value: unknown): value is PromiseLike<void> & {catch(onRejected: () => void): unknown} {
  return typeof value === "object" && value !== null && "then" in value && "catch" in value
}

let fallbackId = 0
function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  fallbackId += 1
  return `web-push-${Date.now()}-${fallbackId}`
}
