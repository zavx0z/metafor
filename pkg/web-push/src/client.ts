import {
  validateWebPushRegistrationAck,
  validateWebPushSubscription,
  validPublicId,
  type WebPushRegistrationAck,
  type WebPushRegistrationRequest,
  type WebPushSubscriptionJSON,
} from "./protocol.ts"
import {
  createWebPushLifecycleEmitter,
  type WebPushLifecycleHook,
} from "./lifecycle.ts"

export type WebPushPermission = "default" | "granted" | "denied"
export type WebPushPermissionDisposition = "request" | "silent" | "blocked" | "unsupported"

export interface WebPushClientSubscription {
  readonly options?: {readonly applicationServerKey?: BufferSource | null}
  toJSON(): unknown
  unsubscribe(): Promise<boolean>
}

export interface WebPushClientPushManager {
  getSubscription(): Promise<WebPushClientSubscription | null>
  subscribe(options: {
    userVisibleOnly: true
    applicationServerKey: Uint8Array<ArrayBuffer>
  }): Promise<WebPushClientSubscription>
}

export interface WebPushClientServiceWorkerContainer {
  readonly ready: PromiseLike<{readonly pushManager: WebPushClientPushManager}>
}

export interface WebPushClientNotifications {
  readonly permission: WebPushPermission
  requestPermission(): Promise<WebPushPermission>
}

export interface WebPushClientEnableAccepted {
  accepted: true
  operationId: string
  subscriptionId: string
  subscription: WebPushSubscriptionJSON
  restored: boolean
  rotated: boolean
}

export interface WebPushClientEnableRejected {
  accepted: false
  operationId: string
  reason: "unsupported" | "permission-denied" | "permission-dismissed" | "registration-rejected"
}

export type WebPushClientEnableResult =
  | WebPushClientEnableAccepted
  | WebPushClientEnableRejected

export interface WebPushClient {
  permissionDisposition(): WebPushPermissionDisposition
  enable(operationId?: string): Promise<WebPushClientEnableResult>
  restore(operationId?: string): Promise<WebPushClientEnableAccepted | null>
  disable(subscriptionId: string, operationId?: string): Promise<boolean>
}

export interface WebPushClientOptions {
  serviceWorker?: WebPushClientServiceWorkerContainer | undefined
  notifications?: WebPushClientNotifications | undefined
  applicationServerKey: string
  registerSubscription(request: WebPushRegistrationRequest): unknown | Promise<unknown>
  unregisterSubscription?: ((input: {operationId: string; subscriptionId: string}) => unknown | Promise<unknown>) | undefined
  onLifecycle?: WebPushLifecycleHook | undefined
  now?: (() => number) | undefined
  createId?: (() => string) | undefined
}

export function createWebPushClient(options: WebPushClientOptions): WebPushClient {
  const now = options.now ?? Date.now
  const createId = options.createId ?? defaultId
  const lifecycle = createWebPushLifecycleEmitter({
    source: "client",
    onLifecycle: options.onLifecycle,
    now,
    createId,
  })
  const applicationServerKey = decodeApplicationServerKey(options.applicationServerKey)

  const registerWithServer = async (
    subscription: WebPushClientSubscription,
    operationId: string,
    restored: boolean,
    rotated: boolean,
  ): Promise<WebPushClientEnableResult> => {
    const subscriptionJson = validateWebPushSubscription(subscription.toJSON())
    const request: WebPushRegistrationRequest = {
      schema: 1,
      operationId,
      subscription: subscriptionJson,
    }
    const acknowledgement = validateWebPushRegistrationAck(await options.registerSubscription(request))
    if (!acknowledgement.accepted) {
      lifecycle.emit({
        type: "client.registration-rejected",
        operationId,
        detail: {reason: "RegistrationRejected"},
      })
      return {accepted: false, operationId, reason: "registration-rejected"}
    }
    lifecycle.emit({
      type: "client.registration-accepted",
      operationId,
      subjectId: acknowledgement.subscriptionId,
      detail: {subscriptionId: acknowledgement.subscriptionId},
    })
    return {
      accepted: true,
      operationId,
      subscriptionId: acknowledgement.subscriptionId,
      subscription: subscriptionJson,
      restored,
      rotated,
    }
  }

  return {
    permissionDisposition() {
      if (!options.serviceWorker || !options.notifications) return "unsupported"
      if (options.notifications.permission === "granted") return "silent"
      if (options.notifications.permission === "denied") return "blocked"
      return "request"
    },

    async enable(requestedOperationId) {
      const operationId = operationIdOrCreate(requestedOperationId, createId)
      if (!options.serviceWorker || !options.notifications) {
        lifecycle.emit({type: "client.unsupported", operationId})
        return {accepted: false, operationId, reason: "unsupported"}
      }
      lifecycle.emit({type: "client.supported", operationId})

      if (options.notifications.permission === "denied") {
        lifecycle.emit({
          type: "client.permission-denied",
          operationId,
          detail: {permission: "denied"},
        })
        return {accepted: false, operationId, reason: "permission-denied"}
      }

      let permission: WebPushPermission
      permission = options.notifications.permission
      if (permission === "default") {
        lifecycle.emit({
          type: "client.permission-requested",
          operationId,
          detail: {permission},
        })
        permission = await options.notifications.requestPermission()
      }
      if (permission === "default") {
        lifecycle.emit({
          type: "client.permission-dismissed",
          operationId,
          detail: {permission},
        })
        return {accepted: false, operationId, reason: "permission-dismissed"}
      }
      if (permission === "denied") {
        lifecycle.emit({
          type: "client.permission-denied",
          operationId,
          detail: {permission},
        })
        return {accepted: false, operationId, reason: "permission-denied"}
      }
      lifecycle.emit({
        type: "client.permission-granted",
        operationId,
        detail: {permission},
      })

      const registration = await options.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      let subscription: WebPushClientSubscription
      let restored = false
      let rotated = false
      if (existing && applicationServerKeyMatches(existing.options?.applicationServerKey, applicationServerKey)) {
        subscription = existing
        restored = true
        lifecycle.emit({type: "client.subscription-restored", operationId})
      } else {
        if (existing) {
          await existing.unsubscribe()
          rotated = true
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
        lifecycle.emit({
          type: rotated ? "client.subscription-rotated" : "client.subscription-created",
          operationId,
        })
      }

      return registerWithServer(subscription, operationId, restored, rotated)
    },

    async restore(requestedOperationId) {
      const operationId = operationIdOrCreate(requestedOperationId, createId)
      if (!options.serviceWorker || !options.notifications) {
        lifecycle.emit({type: "client.unsupported", operationId})
        return null
      }
      lifecycle.emit({type: "client.supported", operationId})
      if (options.notifications.permission !== "granted") return null
      lifecycle.emit({
        type: "client.permission-granted",
        operationId,
        detail: {permission: "granted"},
      })
      const registration = await options.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (!existing || !applicationServerKeyMatches(existing.options?.applicationServerKey, applicationServerKey)) return null
      lifecycle.emit({type: "client.subscription-restored", operationId})
      const result = await registerWithServer(existing, operationId, true, false)
      return result.accepted ? result : null
    },

    async disable(subscriptionId, requestedOperationId) {
      if (!validPublicId(subscriptionId)) throw new Error("Invalid subscriptionId")
      const operationId = operationIdOrCreate(requestedOperationId, createId)
      try {
        const registration = await options.serviceWorker?.ready
        const subscription = await registration?.pushManager.getSubscription()
        const localRemoved = subscription ? await subscription.unsubscribe() : true
        if (options.unregisterSubscription) {
          await options.unregisterSubscription({operationId, subscriptionId})
        }
        lifecycle.emit({
          type: "client.unsubscribed",
          operationId,
          subjectId: subscriptionId,
          detail: {subscriptionId},
        })
        return localRemoved
      } catch (error) {
        lifecycle.emit({
          type: "client.unsubscribe-failed",
          operationId,
          subjectId: subscriptionId,
          detail: {subscriptionId, reason: publicErrorReason(error)},
        })
        throw error
      }
    },
  }
}

export function decodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid VAPID public key")
  }
  const padding = "=".repeat((4 - value.length % 4) % 4)
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

function applicationServerKeyMatches(
  current: BufferSource | null | undefined,
  expected: Uint8Array<ArrayBuffer>,
): boolean {
  if (current === null || current === undefined) return false
  const currentBytes = current instanceof ArrayBuffer
    ? new Uint8Array(current)
    : new Uint8Array(current.buffer, current.byteOffset, current.byteLength)
  return currentBytes.length === expected.length && currentBytes.every((value, index) => value === expected[index])
}

function operationIdOrCreate(value: string | undefined, createId: () => string): string {
  const operationId = value ?? createId()
  if (!validPublicId(operationId)) throw new Error("Invalid operationId")
  return operationId
}

function publicErrorReason(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : "UnknownError"
}

let fallbackId = 0
function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  fallbackId += 1
  return `web-push-${Date.now()}-${fallbackId}`
}

export type {WebPushRegistrationAck}
